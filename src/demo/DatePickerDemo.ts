export default class DatePickerDemo {
    private _view: fgui.GComponent;
    private _btn: fgui.GButton;
    private _dateText: fgui.GTextField;
    constructor() {
        fgui.UIPackage.loadPackage("res/UI/DatePicker", Laya.Handler.create(this, this.onUILoaded));
    }

    onUILoaded() {
        this._view = fgui.UIPackage.createObject("DatePicker", "Main").asCom;
        this._view.makeFullScreen();
        fgui.GRoot.inst.addChild(this._view);
        this._btn = this._view.getChild("n1").asButton;
        this._btn.onClick(this, this.show);

        this._dateText = this._view.getChild("n2").asTextField;
        Laya.stage.on("set_date", this, this.updateDate);
        Laya.stage.event("dataPicker_init");
    }

    show(): void {
        Laya.stage.event("date_show");
    }

    updateDate(year: number, month: number, day: number): void {
        this._dateText.setVar("year", year + "").setVar("month", month + "").setVar("date", day + "").flushVars();
    }

    destroy() {
        this._btn.offClick(this, this.show);
        fgui.UIPackage.removePackage("DatePicker");
    }
}
