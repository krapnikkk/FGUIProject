export default class DatePicker extends fgui.GComponent {
    private _btnCancel: fgui.GButton;
    private _btnComfirm: fgui.GButton;
    private _yearList: fgui.GList;
    private _yearTotalCount: number = new Date().getFullYear();
    private _yearCount: number = 101;
    private _startYear: number = this._yearTotalCount - this._yearCount;
    private _monthList: fgui.GList;
    private _monthTotalCount: number = 12;
    private _startMonth: number = 1;
    private _dateList: fgui.GList;
    private _dateTotalCount: number = 31;
    private _startDate: number = 1;
    private _listRow: number = 4;
    private _currentYear: number;
    private _currentMonth: number;
    private _currentDate: number;

    protected constructFromXML(xml: any): void {
        super.constructFromXML(xml);
        Laya.stage.on("dataPicker_init", this, this.init);
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
        this._yearList.on(fgui.Events.SCROLL, this, this.yearOnScroll);

        this._monthList = this.getChild("month_list").asList;
        this._monthList.on(fgui.Events.SCROLL, this, this.monthOnScroll);
        this._monthList.setVirtualAndLoop();
        this._monthList.itemRenderer = Laya.Handler.create(this, this.renderMonthListItem, null, false);
        this._monthList.numItems = this._monthTotalCount;


        this._dateList = this.getChild("date_list").asList;
        this._dateList.setVirtualAndLoop();
        this._dateList.itemRenderer = Laya.Handler.create(this, this.renderDateListItem, null, false);
        this._dateList.numItems = this._dateTotalCount;
        this._dateList.on(fgui.Events.SCROLL, this, this.dateOnScroll);

        let date = new Date();
        this.setDate(date.getFullYear(), date.getMonth() + 1, date.getDate());
    }

    public renderYearListItem(index: number, obj: fgui.GObject): void {
        var item: fgui.GButton = <fgui.GButton>obj;
        item.title = this._startYear + index + 1 + "年";
    }

    public renderMonthListItem(index: number, obj: fgui.GObject): void {
        var item: fgui.GButton = <fgui.GButton>obj;
        item.title = this._startMonth + index + "月";
    }

    public renderDateListItem(index: number, obj: fgui.GObject): void {
        var item: fgui.GButton = <fgui.GButton>obj;
        item.title = this._startDate + index + "日";
    }

    yearOnScroll() {
        let nowIndex = this._yearList.getFirstChildInView();
        this._currentYear = nowIndex + this._listRow > this._yearCount ? this._startYear + nowIndex + this._listRow - this._yearCount : this._startYear + nowIndex + this._listRow;
        this.updateDateList();
        this.updateDateText();
    }

    monthOnScroll() {
        let nowIndex = this._monthList.getFirstChildInView();
        this._currentMonth = nowIndex + this._listRow > this._monthTotalCount ? this._listRow + nowIndex - this._monthTotalCount : this._listRow + nowIndex;
        this.updateDateList();
        this.updateDateText();
    }

    dateOnScroll() {
        let nowIndex = this._dateList.getFirstChildInView();
        this._currentDate = nowIndex + this._listRow > this._dateTotalCount ? this._listRow + nowIndex - this._dateTotalCount : this._listRow + nowIndex;
        this.updateDateText();
    }

    public setDate(year: number, month: number, date: number) {
        year -= this._startYear;
        let yearIdx = year - this._listRow >= 0 ? year - this._listRow : this._yearTotalCount + year - this._listRow;
        this._yearList.scrollToView(yearIdx);
        let monthIdx = month - this._listRow >= 0 ? month - this._listRow : this._monthTotalCount + month - this._listRow;
        this._monthList.scrollToView(monthIdx);
        let dateIdx = date - this._listRow >= 0 ? date - this._listRow : this._dateTotalCount + date - this._listRow;   
        this._dateList.scrollToView(dateIdx);
        if (yearIdx == 0) {
            this.yearOnScroll();
        }
        if (monthIdx == 0) {
            this.monthOnScroll();
        }
        if (dateIdx == 0) {
            this.dateOnScroll();
        }
    }

    updateDateList() {
        if (this._currentMonth == 2) {
            if (this._currentYear % 4 == 0) {
                this._dateList.numItems = 29;
                this._dateTotalCount = 29;
            } else {
                this._dateList.numItems = 28;
                this._dateTotalCount = 28;
            }
        } else if (this._currentMonth == 1 || this._currentMonth == 3 || this._currentMonth == 5 || this._currentMonth == 7 || this._currentMonth == 10 || this._currentMonth == 12) {
            this._dateList.numItems = 31;
            this._dateTotalCount = 31;
        } else {
            this._dateList.numItems = 30;
            this._dateTotalCount = 30;
        }
        if (this._currentDate > 0) {
            if (this._currentDate > this._dateList.numItems) {
                this._dateList.scrollToView(this._dateTotalCount - this._listRow + 1);//复位到1日
            } else {
                let dateIdx = this._currentDate - this._listRow >= 0 ? this._currentDate - this._listRow : this._dateTotalCount + this._currentDate - this._listRow;
                this._dateList.scrollToView(dateIdx);
            }
            this.dateOnScroll();
        }

    }

    updateDateText() {
        Laya.stage.event("set_date", [this._currentYear, this._currentMonth, this._currentDate]);
    }

    public show(): void {
        this.getTransition("show").play();
    }

    public hide(): void {
        this.getTransition("hide").play();
    }

}