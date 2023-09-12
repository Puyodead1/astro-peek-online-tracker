import betterLogging from "better-logging";
import "dotenv/config";
import fs from "fs";
import { OAuth2Client } from "google-auth-library";
import http from "http";
import open from "open";
import destroyer from "server-destroy";
import url from "url";
import CustomClient from "./client";

betterLogging(console);

function getAuthenticatedClient(): Promise<OAuth2Client> {
    return new Promise((resolve, reject) => {
        // create an oAuth client to authorize the API call.  Secrets are kept in a `keys.json` file,
        // which should be downloaded from the Google Developers Console.
        const oAuth2Client = new OAuth2Client(
            process.env.GOOGLE_OAUTH_CLIENT_ID,
            process.env.GOOGLE_OAUTH_CLIENT_SECRET,
            process.env.GOOGLE_OAUTH_REDIRECT_URI
        );

        // use existing credentials if preseent
        if (fs.existsSync("tokens.json")) {
            const tokens = JSON.parse(fs.readFileSync("tokens.json", "utf-8"));
            if (tokens) {
                console.info("Using existing tokens");
                oAuth2Client.setCredentials(tokens);
                resolve(oAuth2Client);
                return;
            }
        }

        // Generate the url that will be used for the consent dialog.
        const authorizeUrl = oAuth2Client.generateAuthUrl({
            access_type: "offline",
            scope: "https://www.googleapis.com/auth/spreadsheets",
        });

        if (!authorizeUrl) throw new Error("bad authorize url");

        // Open an http server to accept the oauth callback. In this simple example, the
        // only request to our webserver is to /oauth2callback?code=<code>
        const server = http
            .createServer(async (req: http.IncomingMessage, res: http.OutgoingMessage) => {
                try {
                    if (req.url!.indexOf("/oauth2callback") > -1) {
                        // acquire the code from the querystring, and close the web server.
                        const qs = new url.URL(req.url!, "http://localhost:3000").searchParams;
                        const code = qs.get("code");
                        if (!code) throw new Error("No code provided");
                        res.end("Authentication successful! Please return to the console.");
                        server.destroy();

                        // Now that we have the code, use that to acquire tokens.
                        const r = await oAuth2Client.getToken(code);
                        // Make sure to set the credentials on the OAuth2 client.
                        oAuth2Client.setCredentials(r.tokens);
                        console.info("Tokens acquired.");
                        fs.writeFileSync("tokens.json", JSON.stringify(r.tokens));
                        resolve(oAuth2Client);
                    }
                } catch (e) {
                    reject(e);
                }
            })
            .listen(3000, async () => {
                open(authorizeUrl, { wait: false }).then((cp) => cp.unref());
            });
        destroyer(server);
    });
}

async function main() {
    const oAuth2Client = await getAuthenticatedClient();
    console.info("Got client");

    oAuth2Client.on("tokens", (tokens) => {
        // save to json file
        console.info("Saving updated tokens");
        fs.writeFileSync("tokens.json", JSON.stringify(tokens));
    });

    const client = new CustomClient(oAuth2Client);

    client.on("ready", async () => {
        console.info(`Logged in as ${client.user!.tag}`);

        // force load all member presences
        console.info("Fetching members");
        const guild = client.guilds.cache.get(process.env.GUILD_ID!);
        if (!guild) {
            console.error("Guild not found");
            return;
        }
        // force load all members
        const members = await guild.members.fetch({ withPresences: true });
        console.info(`Fetched ${members.size} members`);
        await client.collectMetric();
        await client.startTimer();
    });

    await client.start(process.env.TOKEN!);
}

main().catch(console.error);
