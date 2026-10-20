# Setting up kweezlet

Part 1 and 2 happen once, together with your dad (about 45 minutes). After that, part 3 is all you need every day.

## Part 1: Accounts

| Account                                                                             | What for                                                    | When                                        |
| ----------------------------------------------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------- |
| **Xiaomi MiMo** ([platform.xiaomimimo.com](https://platform.xiaomimimo.com))        | The AI that writes code with you                            | Now                                         |
| **Cloudflare** ([dash.cloudflare.com/sign-up](https://dash.cloudflare.com/sign-up)) | Putting kweezlet online, so it works on your phone anywhere | When you want it live. Free, no credit card |
| **GitHub** (you already have one: `usernamehere0923`)                               | Your code lives there; every change is saved there          | Now                                         |

**Xiaomi MiMo:** sign up, pick a plan (Token Plan, or pay-as-you-go) and create an **API key**. It looks like `tp-...` or `sk-...`. Keep it secret: anyone with it can use your plan.

## Part 2: Install the tools (once)

Everything here happens in the **Terminal** app: press `Cmd + Space`, type `Terminal`, press Enter.
Paste each command, press Enter, wait until it is done.

**1. Apple developer tools**

```sh
xcode-select --install
```

A window pops up: click **Install**. "Already installed" is fine too.

**2. Homebrew** (installs everything else)

```sh
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

It asks for the Mac password (the letters stay invisible while typing, that's normal).
At the end it shows **"Next steps"** with two or three lines: run those too, then close Terminal and open a new one.

**3. Node.js, GitHub tool and OpenCode**

```sh
brew install node gh
brew install --cask opencode-desktop
```

**4. Tell git who you are**

Your project is public on GitHub, so everyone can read the email in it. Use this GitHub address instead of your real one; it still counts as you:

```sh
git config --global user.name "Your Name"
git config --global user.email "339172114+usernamehere0923@users.noreply.github.com"
```

**5. Get the project**

Log in to GitHub. Choose **GitHub.com**, **HTTPS**, **Yes** (use it for git), **Login with a web browser**, then type the code it shows into the browser:

```sh
gh auth login
```

Download the project into your home folder and get it ready:

```sh
gh repo clone usernamehere0923/kweezlet ~/kweezlet
cd ~/kweezlet
npm install
npx playwright install chromium
npm run db:migrate
npm run user:add -- demo demo
```

**6. Connect OpenCode to MiMo**

1. Open **OpenCode** (Applications) and open the `kweezlet` folder in it.
2. Type `/connect`, search for **Xiaomi**, choose the region that matches your plan (Europe for us), paste the API key.
3. Type `/models` and choose **mimo-v2.6-pro**.

You can close Terminal now. You won't need it every day.

## Part 3: Every day

1. **Start the app:** double-click `Start kweezlet.command` in the `kweezlet` folder. A window opens (leave it open) and the app appears in your browser.
   Log in with `demo` / `demo`. Click **Design** to see all the building blocks.
2. **Build:** in OpenCode, describe what you want. Not sure what? Start with Part 4.
   It already knows the project rules (they are in `AGENTS.md`).
3. **Stop the app:** close the window from step 1.

Try it on your iPhone (same wifi): ask OpenCode _"start the app for my iPhone"_.

## Part 4: What kweezlet can do, and what's next

kweezlet already does a lot. Start the app (Part 3) and look around:

- **Sets:** create, edit and delete your own study sets, with a language for the terms and one for the definitions.
- **Flashcards:** tap or press Space to flip, arrows for next and previous, Know it / Still learning.
- **Learn, Test, Match:** practice until you know every term, take a test with a score, race against the clock.
- **Review:** the terms that are due again, so you don't forget what you learned.
- **Audio:** the speaker button reads a card out loud in its language.
- **Account levels:** admin, pro and standard.

**What next:** the plan for the next big step (phase 8, sets made by AI) is in `PLAN.md`. Ask OpenCode _"explain PLAN.md to me in simple words"_. Your own ideas go through OpenCode the same way. Write what you want, then add:

> Build the screens only from the building blocks on the Design page (`src/ui`). Follow all rules in `AGENTS.md`.
> First show me your plan in short steps and wait until I say go. Then build one step at a time and tell me in simple words what each part does.

Read the plan, ask about anything unclear, then say **go**. After each step, try it in the browser (and on the phone). Works? OpenCode saves it with a commit and pushes it to GitHub.

Put it online: ask _"help me deploy kweezlet"_ (needs the Cloudflare account from Part 1).

## When something is stuck

- **The page keeps loading forever:** close the start window, double-click `Start kweezlet.command` again.
- **"Wrong username or password" for demo:** ask OpenCode to run `npm run user:add -- demo demo`. It sets the password back to `demo` and keeps your cards.
- **Anything else:** copy the red error text and paste it into OpenCode.
