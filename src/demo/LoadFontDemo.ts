export default class LoadFontDemo {
    private _view: fgui.GComponent;
    constructor() {
        this.loadFont();
    }

    loadFont() {
        //使用前先加载字体
        let fontName = "customFont"; // fgui编辑器中的字体资源文件同名
        const customFont = new FontFace(fontName, 'url(./res/font/zkklt.ttf)');
        customFont.load().then(font => {
            document.fonts.add(font);
        }).then(() => {
            fgui.UIPackage.loadPackage("res/UI/LoadFont", Laya.Handler.create(this, this.onUILoaded));
        })
    }

    onUILoaded() {
        this._view = fgui.UIPackage.createObject("LoadFont", "Main") as fairygui.GComponent;
        this._view.makeFullScreen();
        fgui.GRoot.inst.addChild(this._view);
        this._view.getChild("btn_compress").onClick(this,this.compress);
        this._view.getChild("btn_bmfont").onClick(this,this.bmfont);

    }

    compress(){
        window.open("https://kekee000.github.io/fonteditor/");
    }

    bmfont(){
        window.open("https://github.com/krapnikkk/TextImageGenerator");
    }

    destroy() {
        fgui.UIPackage.removePackage("LoadFont");
    }
}
