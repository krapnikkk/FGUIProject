export default class DatePicker extends fgui.GComponent {
    private _btnCancel: fgui.GButton;
    private _btnComfirm: fgui.GButton;
    private _yearList: fgui.GList;
    private _yearCount: number = 100;
    private _startYear: number = 1921;
    private _monthList: fgui.GList;
    private _monthCount: number = 12;
    private _startMonth: number = 1;
    private _dateList: fgui.GList;
    private _dateCount: number = 31;
    private _startDate: number = 1;
    private _listRow:number = 3;

    protected constructFromXML(xml: any): void {
        super.constructFromXML(xml);
        this.init();
    }


    public constructor() {
        super();
    }

    public init() {
        Laya.stage.on("date_show", this, this.show);
        Laya.stage.on("date_hide", this, this.hide);
        this._btnCancel = this.getChild("n8").asButton;
        this._btnCancel.onClick(this, this.hide);
        this._btnComfirm = this.getChild("n9").asButton;
        this._btnComfirm.onClick(this, this.hide);
        this._yearList = this.getChild("year_list").asList;
        this._yearList.setVirtualAndLoop();
        this._yearList.itemRenderer = Laya.Handler.create(this, this.renderYearListItem, null, false);
        this._yearList.numItems = this._yearCount;

        this._monthList = this.getChild("month_list").asList;
        this._monthList.setVirtualAndLoop();
        this._monthList.itemRenderer = Laya.Handler.create(this, this.renderMonthListItem, null, false);
        this._monthList.numItems = this._monthCount;

        this._dateList = this.getChild("date_list").asList;
        this._dateList.setVirtualAndLoop();
        this._dateList.itemRenderer = Laya.Handler.create(this, this.renderDateListItem, null, false);
        this._dateList.numItems = this._dateCount;
        let date = new Date();
        this.setDate(date.getFullYear(), date.getMonth(), date.getDate());
    }

    public renderYearListItem(index: number, obj: fgui.GObject): void {
        var item: fgui.GButton = <fgui.GButton>obj;
        item.title = this._startYear + index + "年";
    }

    public renderMonthListItem(index: number, obj: fgui.GObject): void {
        var item: fgui.GButton = <fgui.GButton>obj;
        item.title = this._startMonth + index + "月";
    }

    public renderDateListItem(index: number, obj: fgui.GObject): void {
        var item: fgui.GButton = <fgui.GButton>obj;
        item.title = this._startDate + index + "日";
    }

    public setDate(year: number, month: number, day: number) {
        this._yearList.scrollToView(3);
        this._monthList.scrollToView(2);
        this._dateList.scrollToView(1);
    }

    public show(): void {
        this.getTransition("show").play();
    }

    public hide(): void {
        this.getTransition("hide").play();
    }

}