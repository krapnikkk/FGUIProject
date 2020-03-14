export default class Scratch extends fgui.GComponent {
    private _panel: fgui.GComponent;
    private _maskPanel: fgui.GComponent;
    private preX: number = 0;
    private preY: number = 0;
    private firstBrush: boolean = true;
    protected constructFromXML(xml: any): void {
        super.constructFromXML(xml);
        this.on(Laya.Event.MOUSE_DOWN, this, this.onMouseDown);
        this.on(Laya.Event.MOUSE_UP, this, this.onMouseUp);
        this._panel = this.getChild("panel").asCom;//补位图层
        this._maskPanel = this.getChild("mask").asCom;
    }
    public constructor() {
        super();
    }

    private onMouseDown(evt: Laya.Event) {
        if (this._maskPanel) {
            if (this.firstBrush) {
                this._maskPanel.displayObject.graphics.clear();//清除遮罩的位图数据
                this.firstBrush = false;
            }
            this.preX = evt.target.mouseX;
            this.preY = evt.target.mouseY;
            this._maskPanel.displayObject.graphics.drawCircle(this.preX, this.preY, 40, "#a5ff00");//绘图填充位图内容，补充遮罩
            this.on(Laya.Event.MOUSE_MOVE, this, this.onMouseMove);
        }
        if (this._panel) {//刮刮卡的时候，补位图层隐藏
            this._panel.visible = false;
        }
    }
    private onMouseMove(evt: any): void {
        var curX = evt.target.mouseX;
        var curY = evt.target.mouseY;
        if (this._maskPanel) {
            this._maskPanel.displayObject.graphics.drawCircle(curX, curY, 40, "#a5ff00");
            this.preX = curX;
            this.preY = curY
        }
    }
    private onMouseUp(evt: any): void {
        this.off(Laya.Event.MOUSE_MOVE, this, this.onMouseMove);
    }

}