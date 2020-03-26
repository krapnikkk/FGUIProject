export default class DatePicker extends fgui.GComponent {
    private _btnCancel:fgui.GButton;
    private _btnComfirm:fgui.GButton;
    protected constructFromXML(xml: any): void {
        super.constructFromXML(xml);
        Laya.stage.on("date_show", this, this.show);
        Laya.stage.on("date_hide", this, this.hide);
        this._btnCancel = this.getChild("n8").asButton;
        this._btnCancel .onClick(this,this.hide);
        this._btnComfirm = this.getChild("n9").asButton;
        this._btnComfirm .onClick(this,this.hide);
    }
    public constructor() {
        super();
    }

    public show(): void {
        this.getTransition("show").play();
    }

    public hide(): void {
        this.getTransition("hide").play();
    }

}