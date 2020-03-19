
export default class EmojiParser extends fgui.UBBParser {
    private static TAGS: Array<string> = ["1f600", "1f601", "1f602", "1f603", "1f604", "1f605", "1f606", "1f607", "1f608", "1f609", "1f610", "1f611", "1f612", "1f613", "1f614", "1f615", "1f616", "1f617", "1f618", "1f619", "1f620"];

    public constructor() {
        super();



        let tagUrls: string[] = [];
        for (let i = 0; i < EmojiParser.TAGS.length; i++) {
            const url = `./res/emoji/${EmojiParser.TAGS[i]}.png`;
            tagUrls.push(url);
        }

        Laya.loader.load(tagUrls, Laya.Handler.create(this, this.onTAGSLoaded))
    }

    private onTAGSLoaded() {
        EmojiParser.TAGS.forEach(element => {
            this._handlers[":" + element] = this.onTag_Emoji;
        });
    }

    private onTag_Emoji(tagName: string, end: boolean, attr: string): string {
        return "<img src='./res/emoji/" + tagName.substring(1).toLowerCase() + ".png'/>";
    }
}