export default class DatePickerDemo {
    private _view: fgui.GComponent;
    private _btn: fgui.GButton;
    constructor() {
        fgui.UIPackage.loadPackage("res/UI/DatePicker", Laya.Handler.create(this, this.onUILoaded));
    }

    onUILoaded() {
        this._view = fgui.UIPackage.createObject("DatePicker", "Main").asCom;
        this._view.makeFullScreen();
        fgui.GRoot.inst.addChild(this._view);
        this._btn = this._view.getChild("n1").asButton;
        this._btn.onClick(this,this.show);
    }

    show():void {
        console.log("show");
        Laya.stage.event("date_show");
    }

    destroy() {
        this._btn.offClick(this,this.show);
        fgui.UIPackage.removePackage("DatePicker");
    }
}
