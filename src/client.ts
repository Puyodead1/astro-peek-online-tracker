import { Client, PresenceUpdateStatus } from "discord.js";
import { OAuth2Client } from "google-auth-library";
import { GoogleSpreadsheet } from "google-spreadsheet";

export default class CustomClient extends Client {
    public readonly doc: GoogleSpreadsheet;
    private timer?: NodeJS.Timeout;
    constructor(private readonly oauthClient: OAuth2Client) {
        super({ intents: ["GuildPresences", "GuildMembers"] });

        this.doc = new GoogleSpreadsheet(process.env.SHEET_ID as string, oauthClient);
    }

    public async start(token: string): Promise<void> {
        await this.doc.loadInfo();

        // check if theres a sheet with the name "test"
        if (!this.doc.sheetsByTitle["Astro"]) {
            // if not, create one
            console.info("Creating sheet");
            await this.doc.addSheet({ title: "Astro", headerValues: ["time", "count"] });
        }

        await this.login(token);
    }

    public async insert(count: number) {
        const sheet = this.doc.sheetsByTitle["Astro"];
        await sheet.addRow({ time: new Date().toISOString(), count });
    }

    public async getOnlineCount(): Promise<number> {
        const guild = await this.guilds.fetch(process.env.GUILD_ID as string);
        return guild.members.cache.filter((m) => m.presence && m.presence.status === PresenceUpdateStatus.Online).size;
    }

    public async collectMetric() {
        const online = await this.getOnlineCount();
        await this.insert(online);
    }

    public async startTimer() {
        console.debug("Starting Timer");
        // get online count every hour
        this.timer = setInterval(async () => {
            console.info("Running metric collection");
            await this.collectMetric();
        }, 1000 * 60 * 60);
    }
}
