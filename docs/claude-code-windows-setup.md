# Claude Code — 0 to 1 Setup Guide (Windows)

A beginner-friendly, step-by-step guide for setting up Claude Code with AWS Bedrock at Mendix on Windows.

---

## Before You Start

**What is Claude Code?** Claude Code is a command-line tool that lets you use Claude AI directly inside your terminal. It can read your code, write code, run commands, and help you build software — all through a chat-like interface.

**What is AWS Bedrock?** AWS Bedrock is Amazon's service that hosts AI models (including Claude). Instead of using Anthropic's API directly, Mendix uses Claude through AWS Bedrock — all data stays within Mendix AWS infrastructure.

**What you will need:**
- A Windows 10 (build 1903+) or Windows 11 PC
- An internet connection
- Your Mendix SSO credentials
- An AWS Sandbox account (see prerequisites below)

---

## 1. Prerequisites

You need these before starting:

- **Mendix SSO access** — your standard Mendix login
- **AWS Sandbox account** — request one at AWS Accounts Info - Request Process
- **Windows Terminal** — recommended shell host (see below)
- **PowerShell 7** — the modern cross-platform PowerShell
- **Git for Windows** — required for cloning repos and running the `.sh` guardrail hooks
- **AWS CLI v2** — check with `aws --version`; install if missing (see below)

> **Already a terminal user?** If you already use PowerShell or Git Bash for day-to-day development, skip ahead to [2. Install Claude Code](#2-install-claude-code).

---

### Opening a Terminal (Windows)

**Option A — Windows Terminal (recommended)**
1. Press `Win + S`, type **Windows Terminal**, press Enter
2. If not installed: open the **Microsoft Store**, search **Windows Terminal**, install it
3. Windows Terminal opens PowerShell by default — this is what you'll use throughout this guide

**Option B — PowerShell directly**
1. Press `Win + S`, type **PowerShell 7**, press Enter
2. If PowerShell 7 is not installed, see below

> **Tip:** Pin Windows Terminal to your taskbar — right-click it and select *Pin to taskbar*.

---

### Installing PowerShell 7

Open any PowerShell or Command Prompt window and run:

```powershell
winget install Microsoft.PowerShell
```

Close and reopen Windows Terminal. Click the dropdown arrow (▾) next to the + tab button and select **PowerShell** (the one showing version 7.x).

Verify:
```powershell
$PSVersionTable.PSVersion
```
You should see `Major: 7`.

---

### Installing Git for Windows

Git for Windows includes **Git Bash**, which is required to run the `.sh` guardrail hook scripts.

```powershell
winget install Git.Git
```

After installation, close and reopen Windows Terminal.

Verify:
```powershell
git --version
```

> **Important:** During Git installation, when asked about PATH, choose **"Git from the command line and also from 3rd-party software"**. This ensures `.sh` scripts can be found by Claude Code.

---

### Installing AWS CLI

If `aws --version` doesn't work, install via winget:

```powershell
winget install Amazon.AWSCLI
```

Close and reopen Windows Terminal, then verify:

```powershell
aws --version
```

You should see something like `aws-cli/2.x.x`.

---

## 2. Install Claude Code

Install via winget:

```powershell
winget install Anthropic.ClaudeCode
```

If that package is not yet available in winget, use npm instead (requires [Node.js](https://nodejs.org) — install with `winget install OpenJS.NodeJS.LTS` first):

```powershell
npm install -g @anthropic-ai/claude-code
```

After installation, **close Windows Terminal completely and open a new window**.

If the `claude` command is not found after reopening, add npm's global bin folder to your PATH:

```powershell
[Environment]::SetEnvironmentVariable(
  "PATH",
  $env:PATH + ";$env:APPDATA\npm",
  "User"
)
```

Close and reopen the terminal, then verify:

```powershell
claude --version
```

---

## 3. Configure AWS Bedrock

Claude Code at Mendix uses AWS Bedrock — all data stays within Mendix AWS infrastructure.

### Set up your AWS SSO profile

If you don't already have an SSO profile for your sandbox account, add one:

```powershell
aws configure sso
```

Answer the prompts as follows:

```
SSO session name: Mendix
SSO start URL: https://mx-aws-sso.awsapps.com/start
SSO region: eu-central-1
SSO registration scopes: sso:account:access
```

Your browser will open to log in via Mendix SSO. After logging in, return to the terminal and select your sandbox account and role. When asked for a CLI profile name, enter something memorable (e.g., `my-sandbox`).

---

### Example `%USERPROFILE%\.aws\config`

After running `aws configure sso`, your config file should look like this. If something went wrong, open it directly:

```powershell
notepad $env:USERPROFILE\.aws\config
```

```ini
[sso-session Mendix]
sso_start_url = https://mx-aws-sso.awsapps.com/start
sso_region = eu-central-1
sso_registration_scopes = sso:account:access

[profile my-sandbox]
sso_session = Mendix
sso_account_id = 123456789012
sso_role_name = global-administrator
region = eu-central-1
output = json
```

> **Note:** Replace `123456789012` with your actual sandbox account ID (find it in the AWS SSO portal). The `sso_region` field under `[sso-session]` is critical — if it's missing, Claude Code will fail with a cryptic error.

---

### Log in

```powershell
aws sso login --profile my-sandbox
```

> **WARNING:** Production AWS accounts may exist on your machine. Always verify which profile you're using. Run `aws sts get-caller-identity --profile my-sandbox` — if it shows an account you don't recognise, **STOP**.

> **Important:** `aws sso login` only authenticates your SSO session — it does not determine which profile Claude Code uses. The profile Claude Code actually uses is the one set via `AWS_PROFILE` in `.claude/settings.json`. Make sure the profile name there matches the one you log in with.

---

### Verify AWS access

```powershell
aws sts get-caller-identity --profile my-sandbox
```

If you see your Account ID, User ID, and ARN, your AWS connection is working.

---

### Enabling Claude Models on AWS Bedrock

Before Claude Code can work, the Claude models must be enabled in your AWS sandbox account. Ask your AWS administrator to ensure:

- AWS Bedrock is enabled in your account
- Claude models (Claude Sonnet, Claude Haiku) have been granted access in `eu-central-1`
- Your IAM role has the following permissions:

```
bedrock:InvokeModel
bedrock:InvokeModelWithResponseStream
bedrock:ListInferenceProfiles
```

To verify model access yourself:

```powershell
aws bedrock list-inference-profiles --region eu-central-1 --profile my-sandbox
```

You should see Claude model IDs in the output. If you get an "access denied" error, contact your AWS admin.

---

### Configure Claude Code to use Bedrock

The repo's `.claude/settings.json` already includes the Bedrock environment configuration. When you copy the guardrails in step 4, you get this automatically.

The only change you need to make is replacing the `AWS_PROFILE` placeholder with your actual sandbox profile name. Open the file in Notepad or VS Code:

```powershell
notepad .claude\settings.json
# or
code .claude\settings.json
```

Find this line and update it:
```json
"AWS_PROFILE": "my-sandbox"
```

> **Note:** Do not set these as system environment variables — `settings.json` is the recommended way.

---

### Optional: Granular model configuration

Instead of setting a single `ANTHROPIC_MODEL`, you can configure each model tier individually:

```json
{
  "env": {
    "ANTHROPIC_DEFAULT_HAIKU_MODEL": "eu.anthropic.claude-haiku-4-5-20251001-v1:0",
    "ANTHROPIC_DEFAULT_OPUS_MODEL": "eu.anthropic.claude-opus-4-6-v1",
    "ANTHROPIC_DEFAULT_SONNET_MODEL": "eu.anthropic.claude-sonnet-4-5-20250929-v1:0"
  }
}
```

This is useful because Claude Code skills and agents can reference models by tier name. For example, a skill definition can specify which tier to use:

```
---
model: haiku
---
```

This tells Claude Code to use whichever model is mapped to the `haiku` tier. This way you can switch model versions in one place (`settings.json`) without updating every skill.

---

## 4. Set Up Guardrails

Guardrails prevent Claude Code from running dangerous commands. They are mandatory.

### Clone the toolkit and copy guardrails to your project

```powershell
git clone git@ssh.gitlab.rnd.mendix.com:devops/ai-tools/claude-code.git

# Copy .claude folder and CLAUDE.md into your project
Copy-Item -Path "claude-code\.claude" -Destination "C:\path\to\your-project\.claude" -Recurse
Copy-Item -Path "claude-code\CLAUDE.md" -Destination "C:\path\to\your-project\CLAUDE.md"
```

### Allow the hook scripts to run

The hook scripts are `.sh` files that run via Git Bash. Make sure Git Bash is accessible:

```powershell
bash --version
```

If this fails, add Git Bash to your PATH:

```powershell
[Environment]::SetEnvironmentVariable(
  "PATH",
  $env:PATH + ";C:\Program Files\Git\bin",
  "User"
)
```

Close and reopen the terminal, then retry `bash --version`.

> **Note:** Unlike Mac/Linux, Windows does not require `chmod +x` to mark scripts as executable. Git Bash will run `.sh` files directly.

---

### What you just installed

| Layer | File | How it works |
|---|---|---|
| Instructions | `CLAUDE.md` | Tells Claude what it must never do. Soft — Claude usually follows these, but could ignore them. |
| Permission rules | `.claude/settings.json` | Hard deny/ask/allow rules. Claude cannot bypass a deny rule. |
| Hooks | `.claude/hooks/*.sh` | Shell scripts that run before/after every command via Git Bash. Deterministic — impossible to bypass. |

---

### Update your `.gitignore`

Add these lines to your project's `.gitignore`:

```
.claude/audit.log
.claude/settings.local.json
```

### Customize for your project

Edit the copied `CLAUDE.md` to add your project's specific standards (test commands, coding conventions, etc.). Do **not** remove the safety rules section.

---

## 5. First Run

```powershell
cd C:\path\to\your-project
claude
```

### Test that guardrails work

Ask Claude to run something dangerous. It should be blocked:

```
You: run rm -rf /tmp/important
Claude: [BLOCKED by guardrail hook]
```

### Use plan mode for your first real task

When you're ready to do actual work, start with plan mode. Claude will analyse your request and propose a plan without executing anything:

```
You: /plan refactor the authentication module
```

Review the plan. Approve it only when you're comfortable. This is the safest way to start.

---

## 6. Optional — MCP Integrations

MCP (Model Context Protocol) lets Claude interact with external services. These vendors are approved:

| Service | What it does |
|---|---|
| Atlassian | Read/write Jira tickets, search Confluence |
| Datadog | Query dashboards, metrics, logs |
| Snyk | Run vulnerability scans |

See `mcp-configs/examples/` in the toolkit repo for ready-to-use configs.

> **WARNING:** Do not enable vendor-side AI features (Atlassian Intelligence, Datadog AI, etc.) without Security team approval. MCP server integration is approved; vendor AI features are not.

---

## 7. Safety Rules — Quick Reference

These are non-negotiable:

- **Never deploy** — no `terraform apply`, no `kubectl apply`, no `helm install`
- **Never touch production** — only use sandbox AWS accounts
- **Never run destructive commands** — no `aws * delete*`, no `rm -rf` outside your project
- **Never disable guardrails** — hooks and deny rules must stay active
- **Never read credentials** — no outputting tokens or reading `%USERPROFILE%\.aws\credentials`
- **Never push to main** — always use feature branches and MRs
- **Never run as Administrator** — Claude Code should not have elevated privileges

```
Before approving any command:

Is this read-only?
 ├─ YES → Review and approve
 └─ NO → Does it only modify local project files?
     ├─ YES → Review the change, approve if correct
     └─ NO → Does it affect a remote system (AWS, k8s, git remote)?
         ├─ YES → STOP. Do this yourself.
         └─ NO → Review carefully. What does it actually do?
```

---

## 8. Useful Commands Cheat Sheet

### PowerShell Basics

| What you want to do | Command | Example |
|---|---|---|
| See where you are | `pwd` | `pwd` |
| List files in current folder | `ls` or `dir` | `ls` |
| Go into a folder | `cd folder-name` | `cd Documents` |
| Go back one folder | `cd ..` | `cd ..` |
| Go to home folder | `cd ~` | `cd ~` |
| Clear the screen | `cls` or `clear` | `cls` |
| Open current folder in Explorer | `explorer .` | `explorer .` |
| Edit a file | `notepad filename` | `notepad settings.json` |

### Claude Code Commands

| What you want to do | Command |
|---|---|
| Start Claude Code | `claude` |
| Start in a specific folder | `cd C:\my-project; claude` |
| Check health | `/doctor` (inside Claude Code) |
| Switch model | `/model` (inside Claude Code) |
| Clear conversation | `/clear` (inside Claude Code) |
| Exit Claude Code | `/exit` or press `Ctrl + C` twice |
| Get help | `/help` (inside Claude Code) |

### AWS Commands

| What you want to do | Command |
|---|---|
| Log in (SSO) | `aws sso login --profile my-sandbox` |
| Check who you're logged in as | `aws sts get-caller-identity --profile my-sandbox` |
| List available Bedrock models | `aws bedrock list-inference-profiles --region eu-central-1 --profile my-sandbox` |

---

## 9. Troubleshooting

### `'claude' is not recognized as a command`

Close Windows Terminal completely and open a new window.

If still not working, find where Claude was installed:
```powershell
where.exe claude
```

If nothing is found, add npm's global bin folder to your PATH:
```powershell
[Environment]::SetEnvironmentVariable(
  "PATH",
  $env:PATH + ";$env:APPDATA\npm",
  "User"
)
```
Close and reopen the terminal. If `claude` still can't be found, reinstall:
```powershell
npm install -g @anthropic-ai/claude-code
```

---

### `'aws' is not recognized as a command`

Close and reopen Windows Terminal. If still failing:
```powershell
winget install Amazon.AWSCLI
```
Then close and reopen again.

---

### `"API Error: undefined is not an object (evaluating 'K.sso_region')"`

Your AWS SSO profile is missing the `sso_region` field. Open your config:
```powershell
notepad $env:USERPROFILE\.aws\config
```
Make sure your `[sso-session]` block has a `sso_region = eu-central-1` line (see the example in section 3).

---

### `"AWS credentials expired"` or `"Unable to locate credentials"`

Your SSO session has expired. Log in again:
```powershell
aws sso login --profile my-sandbox
```

---

### `"Access denied"` or `"not authorized to perform bedrock:InvokeModel"`

- Your AWS account may not have Bedrock permissions — contact your AWS administrator
- Make sure Claude models are enabled in your Bedrock console for `eu-central-1`

---

### Claude Code starts but gives model errors

- Verify your region has Bedrock available: `aws bedrock list-inference-profiles --region eu-central-1 --profile my-sandbox`
- Check your settings file has `"CLAUDE_CODE_USE_BEDROCK": "1"` (as a string, in quotes)
- Make sure `AWS_PROFILE` in `.claude/settings.json` matches your profile name in `%USERPROFILE%\.aws\config`

---

### Hook scripts don't run / `bash: command not found`

The `.sh` hooks require Git Bash. Verify it's on your PATH:
```powershell
bash --version
```

If not found, add it:
```powershell
[Environment]::SetEnvironmentVariable(
  "PATH",
  $env:PATH + ";C:\Program Files\Git\bin",
  "User"
)
```
Close and reopen Windows Terminal.

---

### `Set-ExecutionPolicy` error when running PowerShell scripts

If you see a script execution policy error, run this once:
```powershell
Set-ExecutionPolicy RemoteSigned -Scope CurrentUser
```

---

## 10. Where to Go Next

| Document | What you'll learn |
|---|---|
| Do's and Don'ts | Detailed safety guidelines with examples of good and bad prompts |
| Security Guardrails | Deep dive into the 3-layer guardrail system |
| Blocked Commands | Full reference of every blocked command pattern |
| Approved Tools | All approved AI tools and how to access them |
| Prompt Templates | Reusable prompts for code review, debugging, and more |
| MCP Configs | How to set up integrations with Jira, Datadog, Snyk |
