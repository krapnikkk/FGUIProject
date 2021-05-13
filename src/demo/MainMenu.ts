import ScratchCardDemo from "./ScratchCardDemo";
import ChatDemo from "./ChatDemo";
import DatePickerDemo from "./DatePickerDemo";
import LoadFontDemo from "./LoadFontDemo";

export default class MainMenu {
    private _view: fgui.GComponent;

    constructor() {
        fgui.UIPackage.loadPackage("res/UI/MainMenu", Laya.Handler.create(this, this.onUILoaded));
    }

    onUILoaded() {
        this._view = fgui.UIPackage.createObject("MainMenu", "Main").asCom;
        this._view.makeFullScreen();
        fgui.GRoot.inst.addChild(this._view);

        this._view.getChild("n1").onClick(this, function () {
            this.startDemo(ScratchCardDemo);
        });
        this._view.getChild("n2").onClick(this, function () {
            this.startDemo(DatePickerDemo);
        });
        this._view.getChild("n3").onClick(this, function () {
            this.startDemo(ChatDemo);
        });
        this._view.getChild("n4").onClick(this, function () {
            this.startDemo(LoadFontDemo);
        });
        
        var reg: Function = Laya.ClassUtils.regClass;
        reg("ScratchCard",ScratchCardDemo);
        reg("ChatDemo",ChatDemo);
        reg("DatePicker",DatePickerDemo);
        let demoName = this.getQueryString("name");
        if(demoName){
            this.startDemo(Laya.ClassUtils.getRegClass(demoName));
        }
    }

    startDemo(demoClass: any): void {
        this._view.dispose();
        let demo: any = new demoClass();
        Laya.stage.event("start_demo", demo);
    }

    destroy() {
        this._view.dispose();
    }

    getQueryString(name: string): string | null {
        var reg = new RegExp("(^|&)" + name + "=([^&]*)(&|$)", "i");
        var r = window.location.search.substr(1).match(reg);
        if (r != null) return unescape(r[2]);
        return null;
    }
}