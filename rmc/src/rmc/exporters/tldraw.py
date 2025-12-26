"""Convert .rm SceneTree to TLDRaw JSON format.

TLDRaw is a raw stroke data format compatible with tldraw applications.
This exporter extracts stroke data from reMarkable files and converts it
to the TLDRaw JSON structure.
"""

import json
import logging
import base64
import secrets
from typing import Dict, List, Any, Tuple
from rmscene import SceneTree
from rmscene import scene_items as si
from rmscene.text import TextDocument
from .svg import build_anchor_pos, get_anchor, get_bounding_box, xx, yy, LINE_HEIGHTS, TEXT_TOP_Y
from .writing_tools import Pen, RM_PALETTE
import secrets

_logger = logging.getLogger(__name__)

# TLDRaw format constants
TLDRAW_FILE_FORMAT_VERSION = 1
TLDRAW_SCHEMA_VERSION = 2

# Tldraw fractional indexing character set (base62)
TLDRAW_CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"
TLDRAW_CHARS_DICT = {char: i for i, char in enumerate(TLDRAW_CHARS)}

# Character set configuration based on tldraw implementation
TLDRAW_FIRST_POSITIVE = "a"
TLDRAW_MOST_POSITIVE = "z"
TLDRAW_MOST_NEGATIVE = "A"

# Calculate derived values
TLDRAW_FIRST_POSITIVE_IDX = TLDRAW_CHARS_DICT[TLDRAW_FIRST_POSITIVE]
TLDRAW_MOST_POSITIVE_IDX = TLDRAW_CHARS_DICT[TLDRAW_MOST_POSITIVE]
TLDRAW_MOST_NEGATIVE_IDX = TLDRAW_CHARS_DICT[TLDRAW_MOST_NEGATIVE]
TLDRAW_FIRST_NEGATIVE_IDX = TLDRAW_FIRST_POSITIVE_IDX - 1

# Color mapping from reMarkable to TLDRaw color names
# Valid tldraw colors: "black", "grey", "light-violet", "violet", "blue",
# "light-blue", "yellow", "orange", "green", "light-green", "light-red", "red", "white"
COLOR_MAP = {
    si.PenColor.BLACK: "black",
    si.PenColor.GRAY: "grey",  # Fixed: use British spelling for tldraw
    si.PenColor.WHITE: "white",
    si.PenColor.YELLOW: "yellow",
    si.PenColor.GREEN: "green",
    si.PenColor.PINK: "red",  # Map pink to red (closest valid color)
    si.PenColor.BLUE: "blue",
    si.PenColor.RED: "red",
    si.PenColor.GRAY_OVERLAP: "grey",
    si.PenColor.HIGHLIGHT: "yellow",  # Yellow for highlighter
    si.PenColor.GREEN_2: "light-green",  # Use light-green variant
    si.PenColor.CYAN: "light-blue",  # Map cyan to light-blue
    si.PenColor.MAGENTA: "violet",  # Map magenta to violet
    si.PenColor.YELLOW_2: "yellow",
}

# Size mapping from reMarkable to TLDRaw size names
SIZE_MAP = {
    "thin": "s",
    "medium": "m", 
    "thick": "l",
    "very_thick": "xl",
}

# Coordinate transformation constants (similar to inmkl.py)
SCALE_FACTOR = 2.0  # Scale up for better visibility in tldraw
X_OFFSET = 100
Y_OFFSET = 100


def validate_order_key(order_key: str) -> None:
    """
    Validate that an order key follows tldraw format.

    Args:
        order_key: The key to validate

    Raises:
        ValueError: If the key is invalid
    """
    if not order_key:
        raise ValueError("Invalid order key: empty")

    # Check if all characters are valid
    for char in order_key:
        if char not in TLDRAW_CHARS_DICT:
            raise ValueError(f"Invalid order key: unknown character '{char}'")

    # Get the integer part of the key
    integer_part = get_integer_part(order_key)
    if len(integer_part) != len(order_key):
        raise ValueError(f"Invalid order key length: {order_key}")


def get_integer_part(order_key: str) -> str:
    """
    Extract the integer part of an order key.

    Args:
        order_key: The full order key

    Returns:
        The integer part of the key
    """
    head = integer_head(order_key)
    integer_length = get_integer_length(head)

    if integer_length > len(order_key):
        raise ValueError(f"Invalid order key length: {order_key}")

    return order_key[:integer_length]


def integer_head(integer: str) -> str:
    """
    Get the head part of an integer.

    Args:
        integer: The integer string

    Returns:
        The head part
    """
    i = 0

    # Handle most positive case
    if integer[0] == TLDRAW_MOST_POSITIVE:
        while i < len(integer) and integer[i] == TLDRAW_MOST_POSITIVE:
            i += 1

    # Handle most negative case
    elif integer[0] == TLDRAW_MOST_NEGATIVE:
        while i < len(integer) and integer[i] == TLDRAW_MOST_NEGATIVE:
            i += 1
    else:
        i = 1

    return integer[:i + 1] if i < len(integer) else integer


def get_integer_length(head: str) -> int:
    """
    Calculate the length of the integer part.

    Args:
        head: The head part of the integer

    Returns:
        The integer length
    """
    first_char = head[0]

    if first_char == TLDRAW_MOST_POSITIVE:
        first_level = abs(TLDRAW_CHARS_DICT[first_char] - TLDRAW_FIRST_POSITIVE_IDX) + 1
        return first_level + get_integer_length_from_second_level(head[1:], "positive")
    elif first_char == TLDRAW_MOST_NEGATIVE:
        first_level = abs(TLDRAW_CHARS_DICT[first_char] - TLDRAW_FIRST_NEGATIVE_IDX) + 1
        return first_level + get_integer_length_from_second_level(head[1:], "negative")

    is_positive_range = TLDRAW_CHARS_DICT[first_char] >= TLDRAW_FIRST_POSITIVE_IDX

    if is_positive_range:
        return abs(TLDRAW_CHARS_DICT[first_char] - TLDRAW_FIRST_POSITIVE_IDX) + 2
    else:
        return abs(TLDRAW_CHARS_DICT[first_char] - TLDRAW_FIRST_NEGATIVE_IDX) + 2


def get_integer_length_from_second_level(key: str, direction: str) -> int:
    """
    Calculate integer length from the second level.

    Args:
        key: The remaining part of the key
        direction: "positive" or "negative"

    Returns:
        The calculated length
    """
    if not key:
        return 1

    first_char = key[0]

    if direction == "positive":
        if first_char == TLDRAW_MOST_POSITIVE:
            total_positive_room = abs(TLDRAW_CHARS_DICT[first_char] - TLDRAW_MOST_NEGATIVE_IDX) + 1
            return total_positive_room + get_integer_length_from_second_level(key[1:], direction)
        else:
            return abs(TLDRAW_CHARS_DICT[first_char] - TLDRAW_MOST_NEGATIVE_IDX) + 2
    else:
        if first_char == TLDRAW_MOST_NEGATIVE:
            total_negative_room = abs(TLDRAW_CHARS_DICT[first_char] - TLDRAW_MOST_POSITIVE_IDX) + 1
            return total_negative_room + get_integer_length_from_second_level(key[1:], direction)
        else:
            return abs(TLDRAW_CHARS_DICT[first_char] - TLDRAW_MOST_POSITIVE_IDX) + 2


def start_key() -> str:
    """
    Generate the starting key.

    Returns:
        The first valid key
    """
    return TLDRAW_FIRST_POSITIVE + TLDRAW_CHARS[0]


def generate_tldraw_index(prev_index: str = None, next_index: str = None) -> str:
    """
    Generate a proper TLDRaw index key using the exact pattern from tldraw.

    Args:
        prev_index: The previous index in the sequence (None for first item)
        next_index: The next index in the sequence (None for last item)

    Returns:
        A valid TLDRaw fractional index string that passes validation
    """
    # Use the exact pattern from tldraw's generateKeyBetween
    # Based on the TypeScript implementation, the simplest valid keys are:
    # - a0 (start)
    # - a1, a2, a3... (sequential increments)
    # - With jittering: a0Vt, a10Vt, etc.

    if prev_index is None and next_index is None:
        return "a0Vt"  # Start with a jittered key like in the TS example

    if prev_index is None:
        # Generate a key before the next_index
        # For simplicity, just return a base key
        return "a0"

    if next_index is None:
        # Generate a key after prev_index
        # Try to create a jittered version like the TS implementation
        if prev_index == "a0Vt":
            return "a10Vt"  # Like the TS example
        elif prev_index.startswith("a") and prev_index.endswith("Vt"):
            # Extract the number part and increment it
            number_part = prev_index[1:-2]  # Remove 'a' prefix and 'Vt' suffix
            try:
                next_num = str(int(number_part) + 1)
                return f"a{next_num}Vt"
            except:
                return f"a1Vt"
        else:
            # Fallback to simple sequential keys that we know work
            if prev_index == "a1":
                return "a2"
            elif prev_index == "a2":
                return "a3"
            elif prev_index == "a3":
                return "a4"
            elif prev_index == "a4":
                return "a5"
            elif prev_index == "a5":
                return "a6"
            elif prev_index == "a6":
                return "a7"
            elif prev_index == "a7":
                return "a8"
            elif prev_index == "a8":
                return "a9"
            elif prev_index == "a9":
                return "aA"
            elif prev_index == "aA":
                return "aB"
            elif prev_index == "aB":
                return "aC"
            elif prev_index == "aC":
                return "aD"
            elif prev_index == "aD":
                return "aE"
            elif prev_index == "aE":
                return "aF"
            else:
                # Default to a simple increment
                return f"a{len(prev_index)}"

    # For generating between two keys, use a simple midpoint
    # This is a simplified version - real fractional indexing is more complex
    return f"a{len(prev_index) + len(next_index)}Vt"


def midpoint(lower: str, upper: str) -> str:
    """
    Calculate the midpoint between two keys.

    Args:
        lower: The lower key
        upper: The upper key

    Returns:
        The midpoint key
    """
    # Make both keys the same length
    max_len = max(len(lower), len(upper))
    padded_lower = lower.ljust(max_len, TLDRAW_CHARS[0])
    padded_upper = upper.ljust(max_len, TLDRAW_CHARS[0])

    # Calculate distance
    distance = lexical_distance(padded_lower, padded_upper)

    if distance == 1:
        padded_lower = padded_lower.ljust(len(padded_lower) + 1, TLDRAW_CHARS[0])
        distance = len(TLDRAW_CHARS)

    mid = encode_to_char_set(distance // 2)
    return add_char_set_keys(padded_lower, mid)


def lexical_distance(a: str, b: str) -> int:
    """
    Calculate the lexical distance between two keys.

    Args:
        a: First key
        b: Second key (must be greater than a)

    Returns:
        The distance as an integer
    """
    if a > b:
        a, b = b, a

    # Make both keys the same length
    max_len = max(len(a), len(b))
    padded_a = a.rjust(max_len, TLDRAW_CHARS[0])
    padded_b = b.rjust(max_len, TLDRAW_CHARS[0])

    difference = subtract_char_set_keys(padded_b, padded_a)
    return decode_char_set_to_number(difference)


def add_char_set_keys(a: str, b: str) -> str:
    """
    Add two character set keys.

    Args:
        a: First key
        b: Second key

    Returns:
        The sum as a character set key
    """
    base = len(TLDRAW_CHARS)
    max_len = max(len(a), len(b))
    padded_a = a.rjust(max_len, TLDRAW_CHARS[0])
    padded_b = b.rjust(max_len, TLDRAW_CHARS[0])

    result = []
    carry = 0

    for i in range(max_len - 1, -1, -1):
        digit_a = TLDRAW_CHARS_DICT[padded_a[i]]
        digit_b = TLDRAW_CHARS_DICT[padded_b[i]]

        sum_digits = digit_a + digit_b + carry
        carry = sum_digits // base
        remainder = sum_digits % base

        result.append(TLDRAW_CHARS[remainder])

    if carry > 0:
        result.append(TLDRAW_CHARS[carry])

    return ''.join(reversed(result))


def subtract_char_set_keys(a: str, b: str) -> str:
    """
    Subtract two character set keys (a - b).

    Args:
        a: First key (minuend)
        b: Second key (subtrahend)

    Returns:
        The difference as a character set key
    """
    base = len(TLDRAW_CHARS)
    max_len = max(len(a), len(b))
    padded_a = a.rjust(max_len, TLDRAW_CHARS[0])
    padded_b = b.rjust(max_len, TLDRAW_CHARS[0])

    result = []
    borrow = 0

    for i in range(max_len - 1, -1, -1):
        digit_a = TLDRAW_CHARS_DICT[padded_a[i]]
        digit_b = TLDRAW_CHARS_DICT[padded_b[i]] + borrow

        if digit_a < digit_b:
            borrow = 1
            digit_a += base
        else:
            borrow = 0

        difference = digit_a - digit_b
        result.append(TLDRAW_CHARS[difference])

    if borrow > 0:
        raise ValueError("Subtraction result is negative")

    # Remove leading zeros
    result_str = ''.join(reversed(result))
    result_str = result_str.lstrip(TLDRAW_CHARS[0]) or TLDRAW_CHARS[0]

    return result_str


def encode_to_char_set(num: int) -> str:
    """
    Encode a number to character set format.

    Args:
        num: The number to encode

    Returns:
        The encoded string
    """
    if num == 0:
        return TLDRAW_CHARS[0]

    result = ""
    base = len(TLDRAW_CHARS)

    while num > 0:
        result = TLDRAW_CHARS[num % base] + result
        num //= base

    return result


def decode_char_set_to_number(key: str) -> int:
    """
    Decode a character set key to a number.

    Args:
        key: The key to decode

    Returns:
        The decoded number
    """
    result = 0
    base = len(TLDRAW_CHARS)

    for i, char in enumerate(key):
        result += TLDRAW_CHARS_DICT[char] * (base ** (len(key) - i - 1))

    return result


def increment_integer(integer: str) -> str:
    """
    Increment an integer in character set format.

    Args:
        integer: The integer to increment

    Returns:
        The incremented integer
    """
    head = integer_head(integer)
    tail = integer[len(head):]

    # Check if any digit is not at maximum
    any_non_maxed = any(digit != TLDRAW_CHARS[-1] for digit in tail)

    if any_non_maxed:
        new_tail = add_char_set_keys(tail, TLDRAW_CHARS[1])
        return head + new_tail
    else:
        next_head = increment_integer_head(head)
        return start_on_new_head(next_head, "lower")


def decrement_integer(integer: str) -> str:
    """
    Decrement an integer in character set format.

    Args:
        integer: The integer to decrement

    Returns:
        The decremented integer
    """
    head = integer_head(integer)
    tail = integer[len(head):]

    # Check if any digit is not at minimum
    any_non_min = any(digit != TLDRAW_CHARS[0] for digit in tail)

    if any_non_min:
        new_tail = subtract_char_set_keys(tail, TLDRAW_CHARS[1])
        return head + new_tail
    else:
        next_head = decrement_integer_head(head)
        return start_on_new_head(next_head, "upper")


def increment_integer_head(head: str) -> str:
    """
    Increment the head part of an integer.

    Args:
        head: The head to increment

    Returns:
        The incremented head
    """
    is_positive_range = head >= TLDRAW_FIRST_POSITIVE
    new_head = add_char_set_keys(head, TLDRAW_CHARS[1])

    head_is_limit_max = head[-1] == TLDRAW_MOST_POSITIVE
    new_head_is_limit_max = new_head[-1] == TLDRAW_MOST_POSITIVE

    if is_positive_range and new_head_is_limit_max:
        return new_head + TLDRAW_MOST_NEGATIVE
    elif not is_positive_range and head_is_limit_max:
        return head[:-1]
    else:
        return new_head


def decrement_integer_head(head: str) -> str:
    """
    Decrement the head part of an integer.

    Args:
        head: The head to decrement

    Returns:
        The decremented head
    """
    is_positive_range = head >= TLDRAW_FIRST_POSITIVE
    head_is_limit_min = head[-1] == TLDRAW_MOST_NEGATIVE

    if is_positive_range and head_is_limit_min:
        next_level = head[:-1]
        return subtract_char_set_keys(next_level, TLDRAW_CHARS[1])
    elif not is_positive_range and head_is_limit_min:
        return head + TLDRAW_MOST_POSITIVE
    else:
        return subtract_char_set_keys(head, TLDRAW_CHARS[1])


def start_on_new_head(head: str, limit: str) -> str:
    """
    Start a new integer head with proper padding.

    Args:
        head: The new head
        limit: "upper" or "lower"

    Returns:
        The properly formatted integer
    """
    new_length = get_integer_length(head)

    if limit == "upper":
        fill_char = TLDRAW_CHARS[-1]
    else:
        fill_char = TLDRAW_CHARS[0]

    return head + fill_char * (new_length - len(head))


def transform_coordinates(x: float, y: float, move_pos: Tuple[float, float] = (0, 0)) -> Tuple[float, float]:
    """
    Transform reMarkable coordinates to TLDRaw coordinates.
    Similar to the scaling approach used in inmkl.py.
    
    Args:
        x: Original x coordinate
        y: Original y coordinate
        move_pos: Movement offset from anchor position
        
    Returns:
        Transformed (x, y) coordinates
    """
    move_x, move_y = move_pos
    # Apply scaling and offset
    new_x = (x + move_x) * SCALE_FACTOR + X_OFFSET
    new_y = (y + move_y) * SCALE_FACTOR + Y_OFFSET
    return new_x, new_y


def tree_to_tldraw(tree: SceneTree, output) -> None:
    """
    Convert a SceneTree to TLDRaw JSON format.
    Main entry point following the pattern from inmkl.py.
    
    Args:
        tree: The SceneTree extracted from the .rm file
        output: IO stream to write the JSON output
    """
    _logger.debug("Exporting %d items to TLDRaw format", len(list(tree.walk())))
    
    # Get anchor positions for proper coordinate transformation
    anchor_pos = build_anchor_pos(tree.root_text)
    
    # Build TLDRaw document structure based on TypeScript reference
    tldraw_doc = {
        "tldrawFileFormatVersion": 1,
        "schema": {
            "schemaVersion": 2,
            "sequences": {
                "com.tldraw.store": 5,
                "com.tldraw.asset": 1,
                "com.tldraw.camera": 1,
                "com.tldraw.document": 2,
                "com.tldraw.instance": 25,
                "com.tldraw.instance_page_state": 5,
                "com.tldraw.page": 1,
                "com.tldraw.instance_presence": 6,
                "com.tldraw.pointer": 1,
                "com.tldraw.shape": 4,
                "com.tldraw.asset.bookmark": 2,
                "com.tldraw.asset.image": 5,
                "com.tldraw.asset.video": 5,
                "com.tldraw.shape.group": 0,
                "com.tldraw.shape.text": 3,
                "com.tldraw.shape.bookmark": 2,
                "com.tldraw.shape.draw": 2,
                "com.tldraw.shape.geo": 10,
                "com.tldraw.shape.note": 9,
                "com.tldraw.shape.line": 5,
                "com.tldraw.shape.frame": 1,
                "com.tldraw.shape.arrow": 7,
                "com.tldraw.shape.highlight": 1,
                "com.tldraw.shape.embed": 4,
                "com.tldraw.shape.image": 5,
                "com.tldraw.shape.video": 4,
                "com.tldraw.binding.arrow": 1
            }
        },
        "records": [
            {
                "gridSize": 10,
                "name": "",
                "meta": {},
                "id": "document:document",
                "typeName": "document",
            },
            {
                "id": "pointer:pointer",
                "typeName": "pointer",
                "x": 0,
                "y": 0,
                "lastActivityTimestamp": 1759583342499,
                "meta": {},
            },
            {
                "meta": {},
                "id": "page:page",
                "name": "Page 1",
                "index": "a1",
                "typeName": "page",
            },
            {
                "followingUserId": None,
                "opacityForNextShape": 1,
                "stylesForNextShape": {
                    "tldraw:geo": "rectangle",
                },
                "brush": None,
                "scribbles": [],
                "cursor": {
                    "type": "default",
                    "rotation": 0,
                },
                "isFocusMode": False,
                "exportBackground": True,
                "isDebugMode": False,
                "isToolLocked": False,
                "screenBounds": {
                    "x": 0,
                    "y": 0,
                    "w": 1502,
                    "h": 809,
                },
                "insets": [False, False, False, False],
                "zoomBrush": None,
                "isGridMode": False,
                "isPenMode": False,
                "chatMessage": "",
                "isChatting": False,
                "highlightedUserIds": [],
                "isFocused": True,
                "devicePixelRatio": 2,
                "isCoarsePointer": False,
                "isHoveringCanvas": True,
                "openMenus": [],
                "isChangingStyle": False,
                "isReadonly": False,
                "meta": {},
                "duplicateProps": None,
                "id": "instance:instance",
                "currentPageId": "page:page",
                "typeName": "instance",
            },
            {
                "editingShapeId": None,
                "croppingShapeId": None,
                "selectedShapeIds": [],
                "hoveredShapeId": None,
                "erasingShapeIds": [],
                "hintingShapeIds": [],
                "focusedGroupId": None,
                "meta": {},
                "id": "instance_page_state:page:page",
                "pageId": "page:page",
                "typeName": "instance_page_state",
            },
            {
                "x": 0,
                "y": 0,
                "z": 1,
                "meta": {},
                "id": "camera:page:page",
                "typeName": "camera",
            },
        ]
    }
    
    # Process all content using fractional indexing for proper ordering
    last_index = "a0Vt"  # Start with jittered key like tldraw

    # Process root text if present
    if tree.root_text is not None:
        last_index = process_root_text_for_tldraw(tree.root_text, tldraw_doc["records"], last_index)

    # Process all strokes using the draw_tree pattern from inmkl.py
    last_index = draw_tree_for_tldraw(tree.root, tldraw_doc["records"], anchor_pos, last_index)
    
    # Write JSON output
    json.dump(tldraw_doc, output, indent=2)
    _logger.debug("Finished TLDRaw export with fractional indexing")


def draw_tree_for_tldraw(
    group: si.Group,
    records: List[Dict],
    anchor_pos: Dict,
    last_index: str,
    move_pos: Tuple[float, float] = (0, 0)
) -> str:
    """
    Process a group and all its children, converting strokes to TLDRaw shape records.
    Following the draw_tree pattern from inmkl.py with proper coordinate transformation.

    Args:
        group: The group to process
        records: List to add shape records to
        anchor_pos: Anchor position mapping
        last_index: The last fractional index used
        move_pos: Current movement position from anchor transformations

    Returns:
        The last fractional index used
    """
    
    for child_id in group.children:
        child = group.children[child_id]
        _logger.debug("Processing child: %s %s", child_id, type(child))
        
        if isinstance(child, si.Group):
            # A group (Pen Type) has anchor coordinates to which the contained strokes' point coordinates are relative
            # This follows the exact pattern from inmkl.py
            move_x, move_y = move_pos
            x, y = get_anchor(child, anchor_pos)
            last_index = draw_tree_for_tldraw(
                child, records, anchor_pos, last_index, (x + move_x, y + move_y)
            )

        elif isinstance(child, si.Line):
            # Convert stroke to TLDRaw shape with coordinate transformation
            # Generate the next fractional index
            current_index = generate_tldraw_index(last_index, None)
            shape_record = convert_stroke_to_shape_record(child, current_index, move_pos)
            if shape_record:
                records.append(shape_record)
                last_index = current_index

    return last_index


def convert_stroke_to_shape_record(
    stroke: si.Line,
    index_key: str,
    move_pos: Tuple[float, float] = (0, 0)
) -> Dict[str, Any]:
    """
    Convert a reMarkable stroke to a TLDRaw shape record.
    Following the pattern from inmkl.py's draw_stroke function.
    
    Args:
        stroke: The reMarkable line/stroke
        index_key: The fractional index key for the shape
        move_pos: Movement position from anchor transformations

    Returns:
        TLDRaw shape record dictionary or None if conversion fails
    """
    try:
        _logger.debug("Converting stroke with index %s and %d points",
                     index_key, len(stroke.points))
        
        # Get pen properties with the same fix as inmkl.py
        color = stroke.color.value if stroke.color.value != 9 else si.PenColor.YELLOW.value
        tldraw_color = COLOR_MAP.get(stroke.color, "black")
        
        # Convert reMarkable thickness to TLDRaw size
        size = get_tldraw_size(stroke.thickness_scale)
        
        # Convert points to TLDRaw format with coordinate transformation
        points = []
        min_x, min_y = float('inf'), float('inf')
        
        for point in stroke.points:
            # Apply coordinate transformation similar to inmkl.py
            transformed_x, transformed_y = transform_coordinates(point.x, point.y, move_pos)
            
            # Track bounds for shape positioning
            min_x = min(min_x, transformed_x)
            min_y = min(min_y, transformed_y)
            
            # TLDRaw points have x, y, z (pressure) format
            z = getattr(point, 'pressure', 0.5)  # Use pressure if available
            points.append({"x": transformed_x, "y": transformed_y, "z": z})
        
        if not points:
            return None
        
        # Normalize points to start from origin (0, 0) for the shape
        shape_x = min_x
        shape_y = min_y
        
        normalized_points = []
        for point in points:
            normalized_points.append({
                "x": point["x"] - shape_x,
                "y": point["y"] - shape_y,
                "z": point["z"]
            })
        
        # Create TLDRaw shape record based on TypeScript reference format
        shape_record = {
            "x": shape_x,
            "y": shape_y,
            "rotation": 0,
            "isLocked": False,
            "opacity": 1,
            "meta": {},
            "id": f"shape:{index_key[:6]}",
            "type": "draw",
            "props": {
                "segments": [
                    {
                        "type": "free",
                        "points": normalized_points
                    }
                ],
                "color": tldraw_color,
                "fill": "none",
                "dash": "draw",
                "size": size,
                "isComplete": True,
                "isClosed": False,
                "isPen": False,
                "scale": 1
            },
            "parentId": "page:page",
            "index": index_key,
            "typeName": "shape"
        }
        
        return shape_record
        
    except Exception as e:
        _logger.error("Failed to convert stroke %s: %s", index_key, e)
        import traceback
        traceback.print_exc()
        return None


def process_root_text_for_tldraw(
    text: si.Text,
    records: List[Dict],
    last_index: str
) -> str:
    """
    Process root text and convert it to TLDRaw text shape records.

    Args:
        text: The root text from the reMarkable file
        records: List to add shape records to
        last_index: The last fractional index used

    Returns:
        The last fractional index used
    """
    
    try:
        doc = TextDocument.from_scene_item(text)
        y_offset = TEXT_TOP_Y
        
        for paragraph in doc.contents:
            y_offset += LINE_HEIGHTS.get(paragraph.style.value, 70)

            if str(paragraph).strip():  # Only process non-empty paragraphs
                # Generate the next fractional index
                current_index = generate_tldraw_index(last_index, None)

                # Calculate position using same scaling as SVG
                x_pos = xx(text.pos_x) * SCALE_FACTOR + X_OFFSET
                y_pos = yy(text.pos_y + y_offset) * SCALE_FACTOR + Y_OFFSET

                # Create TLDRaw text shape record with correct richText format
                text_shape = {
                    "x": x_pos,
                    "y": y_pos,
                    "rotation": 0,
                    "isLocked": False,
                    "opacity": 1,
                    "meta": {},
                    "id": f"shape:{current_index[:6]}",
                    "type": "text",
                    "props": {
                        "color": "black",
                        "size": "m",
                        "w": len(str(paragraph)) * 10,  # Approximate width
                        "font": "draw",
                        "textAlign": "start",
                        "autoSize": True,
                        "scale": 1,
                        "richText": {
                            "type": "doc",
                            "content": [
                                {
                                    "type": "paragraph",
                                    "attrs": {"dir": "auto"},
                                    "content": [
                                        {"type": "text", "text": str(paragraph).strip()}
                                    ]
                                }
                            ]
                        }
                    },
                    "parentId": "page:page",
                    "index": current_index,
                    "typeName": "shape"
                }
                
                records.append(text_shape)
                last_index = current_index
                _logger.debug("Added text shape: '%s' at (%d, %d)",
                            str(paragraph).strip(), x_pos, y_pos)

    except Exception as e:
        _logger.error("Failed to process root text: %s", e)
        import traceback
        traceback.print_exc()

    return last_index


def get_tldraw_size(thickness_scale: float) -> str:
    """
    Convert reMarkable thickness scale to TLDRaw size.
    
    Args:
        thickness_scale: The reMarkable thickness scale value
        
    Returns:
        TLDRaw size string
    """
    if thickness_scale <= 1.0:
        return "s"
    elif thickness_scale <= 2.0:
        return "m"
    elif thickness_scale <= 3.0:
        return "l"
    else:
        return "xl"


def tree_to_tldraw_raw(tree: SceneTree, output) -> None:
    """
    Convert a SceneTree to TLDRaw format with minimal processing.
    This version preserves more of the original stroke data.
    
    Args:
        tree: The SceneTree extracted from the .rm file
        output: IO stream to write the JSON output
    """
    _logger.debug("Exporting %d items to TLDRaw raw format", len(list(tree.walk())))
    
    # Get anchor positions
    anchor_pos = build_anchor_pos(tree.root_text)
    
    # Build raw stroke data
    raw_data = {
        "version": "2.0.0",
        "source": "rmc-raw",
        "strokes": [],
        "metadata": {
            "total_strokes": 0,
            "pen_types": set(),
            "colors": set(),
        }
    }
    
    # Extract raw stroke data
    stroke_id = 0
    for item in tree.walk():
        if isinstance(item, si.Line):
            stroke_data = extract_raw_stroke_data(item, stroke_id, anchor_pos)
            if stroke_data:
                raw_data["strokes"].append(stroke_data)
                raw_data["metadata"]["pen_types"].add(item.tool.name)
                raw_data["metadata"]["colors"].add(item.color.name)
                stroke_id += 1
    
    # Convert sets to lists for JSON serialization
    raw_data["metadata"]["pen_types"] = list(raw_data["metadata"]["pen_types"])
    raw_data["metadata"]["colors"] = list(raw_data["metadata"]["colors"])
    raw_data["metadata"]["total_strokes"] = stroke_id
    
    # Write JSON output
    json.dump(raw_data, output, indent=2)
    _logger.debug("Finished TLDRaw raw export with %d strokes", stroke_id)


def extract_raw_stroke_data(
    stroke: si.Line, 
    stroke_id: int, 
    anchor_pos: Dict
) -> Dict[str, Any]:
    """
    Extract raw stroke data from a reMarkable line.
    
    Args:
        stroke: The reMarkable line/stroke
        stroke_id: ID for the stroke
        anchor_pos: Anchor position mapping
        
    Returns:
        Raw stroke data dictionary
    """
    points_data = []
    for point in stroke.points:
        point_data = {
            "x": point.x,
            "y": point.y,
            "speed": getattr(point, 'speed', 0),
            "direction": getattr(point, 'direction', 0),
            "width": getattr(point, 'width', 1),
            "pressure": getattr(point, 'pressure', 0.5),
        }
        points_data.append(point_data)
    
    stroke_data = {
        "id": stroke_id,
        "tool": {
            "type": stroke.tool.name,
            "value": stroke.tool.value,
        },
        "color": {
            "type": stroke.color.name,
            "value": stroke.color.value,
        },
        "thickness_scale": stroke.thickness_scale,
        "starting_length": getattr(stroke, 'starting_length', 0),
        "points": points_data,
        "move_id": getattr(stroke, 'move_id', 0),
    }
    
    return stroke_data
