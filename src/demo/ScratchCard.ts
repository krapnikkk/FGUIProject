export default class ScratchCard {
    private _view: fgui.GComponent;
    private _bagWindow: fgui.Window;

    constructor() {
        fgui.UIPackage.loadPackage("res/UI/ScratchCard", Laya.Handler.create(this, this.onUILoaded));
    }

    onUILoaded() {
        this._view = fgui.UIPackage.createObject("ScratchCard", "Main").asCom;
        this._view.makeFullScreen();
        fgui.GRoot.inst.addChild(this._view);

        // this._bagWindow = new BagWindow();
        // this._view.getChild("bagBtn").onClick(this, () => { this._bagWindow.show(); });
    }

    destroy() {
        fgui.UIPackage.removePackage("ScratchCard");
    }
}
