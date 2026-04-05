---
name: pr
description: Create a feature branch (if needed), commit changes, push, and open a GitHub PR.
---

# Create PR

Follow these steps to ship the current changes as a pull request:

1. **Check branch**: Run `git branch --show-current`. If on `main`, create a descriptive feature branch:
   ```
   git checkout -b <descriptive-branch-name>
   ```
   Branch names should be short and descriptive (e.g., `fix/widget-clipping`, `feature/trend-export`).

2. **Review changes**: Run `git status` and `git diff` to understand what will be committed. Never commit files containing secrets (`.env`, credentials, etc.).

3. **Run checks**: Run the build and lint checks:
   ```
   cd /Users/bhess/source/universal-hmi && ./dev.sh check
   ```
   If checks fail, fix the issues before proceeding.

4. **Stage files**: Add the relevant changed files by name (avoid `git add -A`).

5. **Commit**: Write a concise commit message summarizing the "why" of the changes. Use a HEREDOC for formatting:
   ```
   git commit -m "$(cat <<'EOF'
   Your commit message here

   Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
   EOF
   )"
   ```

6. **Push**: Push the branch to origin:
   ```
   git push -u origin $(git branch --show-current)
   ```

7. **Create PR**: Use `gh pr create` with a clear title and description:
   ```
   gh pr create --title "Short title" --body "$(cat <<'EOF'
   ## Summary
   - Bullet points describing changes

   ## Test plan
   - [ ] How to verify the changes

   🤖 Generated with [Claude Code](https://claude.com/claude-code)
   EOF
   )"
   ```

8. **Output the PR URL** so the user can see it.
