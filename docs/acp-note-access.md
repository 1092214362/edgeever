# Note access for local ACP agents

When a user sends a message to a local agent in the desktop app, EdgeEver automatically supplies MCP tools for the signed-in account. The user does not need to configure the EdgeEver instance in the agent or create an API token. The tools follow the existing server-side note permissions and can read, create, edit, and delete content in the current workspace. The agent's other local tool permissions remain subject to the agent and ACP client.

The desktop main process retains the login credential and creates a temporary loopback bridge for each turn. The agent receives a temporary credential for that bridge. The bridge expires when the turn ends or is cancelled, or when the current instance or login session changes. A turn with note tools does not start if the current sign-in state cannot be verified.

The ACP session server is named `edgeever-current-workspace`. An agent that already has EdgeEver MCP configured may see two sets of tools. This causes no protocol conflict, but the configurations may target different instances or accounts and may lead to duplicate writes. EdgeEver instructs the agent to use the session server and warns the user to check existing configurations. ACP cannot guarantee that an agent's persistent MCP configuration is replaced or removed.

This feature changes the permission boundary for local ACP agents. Before a formal release, verify tool discovery, account switching, writes, and failure recovery with supported real agents, packaged desktop apps, and an upgrade from an older version.
