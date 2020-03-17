export default class ScratchCard {
    private _view: fgui.GComponent;
    constructor() {
        fgui.UIPackage.loadPackage("res/UI/ScratchCard", Laya.Handler.create(this, this.onUILoaded));
    }

    onUILoaded() {
        this._view = fgui.UIPackage.createObject("ScratchCard", "Main").asCom;
        this._view.makeFullScreen();
        fgui.GRoot.inst.addChild(this._view);
    }

    destroy() {
        fgui.UIPackage.removePackage("ScratchCard");
    }
}
