# Setting up kweezlet

Part 1 and 2 happen once, together with your dad (about 45 minutes). After that, part 3 is all you need every day.

## Part 1: Accounts

| Account                                                                             | What for                                                    | When                                        |
| ----------------------------------------------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------- |
| **Xiaomi MiMo** ([platform.xiaomimimo.com](https://platform.xiaomimimo.com))        | The AI that writes code with you                            | Now                                         |
| **Cloudflare** ([dash.cloudflare.com/sign-up](https://dash.cloudflare.com/sign-up)) | Putting kweezlet online, so it works on your phone anywhere | When you want it live. Free, no credit card |
| **GitHub** ([github.com/signup](https://github.com/signup))                         | Backup of your code in the cloud                            | Later, optional                             |

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

**3. Node.js and OpenCode**

```sh
brew install node
brew install --cask opencode-desktop
```

**4. Tell git who you are** (your own name; the email only goes into your project history)

```sh
git config --global user.name "Your Name"
git config --global user.email "you@example.com"
```

**5. Get the project ready**

Put the `kweezlet` folder into your home folder, then:

```sh
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
2. **Build:** in OpenCode, describe what you want. For example: _"I want to create study sets with a title and a list of terms."_
   It already knows the project rules (they are in `AGENTS.md`).
3. **Stop the app:** close the window from step 1.

Try it on your iPhone (same wifi): ask OpenCode _"start the app for my iPhone"_.

## When something is stuck

- **The page keeps loading forever:** close the start window, double-click `Start kweezlet.command` again.
- **"Wrong username or password" for demo:** ask OpenCode to run `npm run user:add -- demo demo`. It sets the password back to `demo` and keeps your cards.
- **Anything else:** copy the red error text and paste it into OpenCode.
