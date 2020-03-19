export default class DatePicker {
    private _view: fgui.GComponent;
    constructor() {
        fgui.UIPackage.loadPackage("res/UI/DataPicker", Laya.Handler.create(this, this.onUILoaded));
    }

    onUILoaded() {
        this._view = fgui.UIPackage.createObject("DataPicker", "Main").asCom;
        this._view.makeFullScreen();
        fgui.GRoot.inst.addChild(this._view);
    }

    destroy() {
        fgui.UIPackage.removePackage("DataPicker");
    }
}
