import ScratchCard from "./ScratchCard";
import ChatDemo from "./ChatDemo";

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
            this.startDemo(ScratchCard);
        });
        this._view.getChild("n3").onClick(this, function () {
            this.startDemo(ChatDemo);
        });
    }

    startDemo(demoClass: any): void {
        this._view.dispose();
        let demo: any = new demoClass();
        Laya.stage.event("start_demo", demo);
    }

    destroy() {
        this._view.dispose();
    }
}