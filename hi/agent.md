---
hi: 1
families: [AGENT]
---

# Agent

## Intent

On October 29, 2026, Leif confirmed that any agent, such as Grok, GPT, Claude or Cursor, should be able to use AlgoChat and sit in a Raven group as a bot. It lives in this library as an agent module: one shared core, which starts in Python, with an MCP server, a command-line tool and a webhook bridge on top. In the first version the operator always hosts the bot. Each bot has its own wallet, which its operator funds, and its own Raven identity NFT. Its 25 words or key stay on the machine that runs it.

The room owner or an admin adds a bot, and the bot joins straight away. They mark it as a bot only at that moment, and pick its reply mode and its rate limit for that room. The room's record holds all three, so every member and the bot can check them, and every AlgoChat language reads that record. A flag a person sets on their own identity never makes them a bot, because Leif does not want people posing as bots. A bot is never a room admin. It can be in a room's channels when an admin adds it to each one. Removing a bot is an ordinary removal. The owner or an admin can change a bot's mode and rate limit at any time; the suggested limit is 5 replies per minute. Each bot declares its own slash commands, and the MCP server mirrors every command-line command. Bots never answer other bots. When fewer than about 100 replies' worth of fees remain, a bot warns once, in the room where it reached that level, until its wallet is refilled. Payments and tipping come later.

On October 30, 2026, Leif confirmed AGENT-2.a to AGENT-2.f for the bot's own Raven identity NFT ([algochat#59](https://github.com/CorvidLabs/algochat/issues/59)). Its picture is only ever an NFT its wallet holds or an emoji, never a custom picture.

## Criteria

- **AGENT-1**  I want any agent to use AlgoChat through an agent module in this library.
  - **AGENT-1.a**  I can plug an agent in through an MCP server, a command-line tool, or a webhook bridge, and all three sit on the same shared core.
  - **AGENT-1.b**  The shared core starts in Python.
  - **AGENT-1.c**  The webhook bridge may carry readable message text, but only to the same machine or to a secured address over authenticated HTTPS.
  - **AGENT-1.d**  In the first version, I host my bot myself as its operator.
  - **AGENT-1.e**  In the first version, the MCP server has a tool for every command-line command.
- **AGENT-2**  My bot has its own Algorand wallet and its own Raven identity NFT. That identity NFT does not make it a bot.
  - **AGENT-2.a**  As the operator, I can give my bot its own Raven identity NFT from the command line or MCP, and the bot's own wallet pays for it.
  - **AGENT-2.b**  It's the same kind of identity NFT a person makes in Raven, so Raven shows it like anyone else's.
  - **AGENT-2.c**  My bot's picture is an NFT its wallet holds or an emoji. Its public name is its @name. I can change either later without making a second NFT.
  - **AGENT-2.d**  A bot has only one identity NFT. Asking again updates it instead of making another.
  - **AGENT-2.e**  Having the NFT never makes an account a bot, and a bot without one still works.
  - **AGENT-2.f**  The bot's 25 words never leave its machine to make the NFT.
- **AGENT-3**  As the bot's operator, I fund my bot's wallet, and that wallet pays the bot's fees.
  - **AGENT-3.a**  When fewer than about 100 replies' worth of fees remain in my bot's wallet, it posts a short out-of-funds warning once, in the room where it reached that level, and not again until its wallet is refilled.
- **AGENT-4**  My bot's 25 words or key live in an environment variable or a local file on the machine that runs it, and are never committed.
- **AGENT-5**  My bot can read one-to-one messages sent to it and reply to them.
- **AGENT-6**  My bot can read and reply in a group it is in.
- **AGENT-7**  My bot can join a room and leave it.
  - **AGENT-7.a**  My bot is added to a room only by the room's owner or an admin, who marks it as a bot in that room when adding it.
  - **AGENT-7.b**  A flag someone sets on their own identity never makes them a bot.
  - **AGENT-7.c**  Removing my bot from a room is an ordinary removal: the room gets a new key, and my bot is dropped from that room's channels.
  - **AGENT-7.d**  My bot joins as soon as it is added. It does not accept or decline.
  - **AGENT-7.e**  My bot can never be a room admin.
  - **AGENT-7.f**  An account is marked as a bot only when it is added. A member who is already in the room cannot be marked later.
  - **AGENT-7.g**  My bot can be in a room's channels, but an admin adds it to each channel separately.
- **AGENT-8**  In each room, my bot replies only in the mode that room's admin chose, such as only when it is mentioned or replied to, on every message, or only for slash commands.
  - **AGENT-8.a**  There is no default mode. The admin picks one when adding the bot.
  - **AGENT-8.b**  The admin sets that room's rate limit for my bot when adding it, starting from a suggested safe preset of 5 replies per minute, and my bot's replies there stay within it.
  - **AGENT-8.c**  My bot never replies to another bot.
  - **AGENT-8.d**  Writing @ and my bot's name, or replying to one of its messages, both count as mentioning it.
  - **AGENT-8.e**  The room's owner or an admin can change my bot's reply mode and rate limit in that room at any time.
  - **AGENT-8.f**  My bot declares its own slash commands.
- **AGENT-9**  The first version does not send payments or tips. Those come later.
- **AGENT-10**  The room's record holds the bot mark, its reply mode and its rate limit, so every member and my bot can check them.
  - **AGENT-10.a**  Every AlgoChat language reads and checks that record the same way.
