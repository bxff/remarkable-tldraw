# 📜 Rules & Anti-Cheating

## Core Rules

1. **Time**: All work between Oct 4, 12:00 CET and Oct 5, 12:00 CET
2. **Teams**: Solo or duo only
3. **Greenfield**: Must be built from scratch during hackathon
4. **Stack**: Any language, framework, or API allowed
5. **Boilerplate**: Starter templates (create-react-app, etc.) are fine

## Submission Requirements

Submit via [https://forms.acta.so/r/wMobdM](https://forms.acta.so/r/wMobdM):

1. **Public GitHub repo** with complete commit history
2. **60-second demo video** (Loom, YouTube) - must be public
3. **Live public demo** - deployed and working
4. Your email and name

## Anti-Cheating: Required

### 1. Initial Timestamp

Create immediately after starting:

```bash
date > .hackathon-start
git add .hackathon-start
git commit -m "Starting hackathon - $(date)"
git push
```

### 2. Commit History Requirements

- **Minimum 5 commits** during the 24 hours
- First commit after Oct 4, 12:00 CET
- Last commit before Oct 5, 12:00 CET
- Commits spread over time (not all bunched together)
- Natural progression (small → complex)

### 3. Run Verification Before Submitting

```bash
node verify-submission.js
```

## ❌ Will Get You Disqualified

- Commits outside the 24-hour window
- Single massive commit with everything
- Pre-existing project submitted as new
- Plagiarized code
- Private repo or video
- Git history manipulation (rebase, backdating)
- Missing initial timestamp file

## ✅ Allowed

- AI assistants (ChatGPT, Copilot, etc.)
- Copying small snippets from docs
- Using libraries and frameworks
- Following tutorials for specific features
- Getting help on Discord

## ❌ Not Allowed

- Starting before Oct 4, 12:00 CET
- Working after Oct 5, 12:00 CET
- Submitting old projects
- Having someone else build it
- Manipulating Git timestamps

## Questions?

**Gray area?** Ask in Discord or DM [@acta.so](https://instagram.com/acta.so)

Better to ask than risk disqualification.

---

**Build something new. Commit often. Have fun.** 🚀
