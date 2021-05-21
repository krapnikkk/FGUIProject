export default class Scratch extends fgui.GComponent {
    private _panel: fgui.GComponent;
    private _maskPanel: fgui.GComponent;
    private preX: number = 0;
    private preY: number = 0;
    private firstBrush: boolean = true;
    private _circleDiameter:number = 40;
    private _percentCover:number = 0.5;
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
                this.createPoints(this._maskPanel.width, this._maskPanel.height);
            }
            this.preX = evt.target.mouseX;
            this.preY = evt.target.mouseY;
            this._maskPanel.displayObject.graphics.drawCircle(this.preX, this.preY, this._circleDiameter, "#a5ff00");//绘图填充位图内容，补充遮罩
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
            this._maskPanel.displayObject.graphics.drawCircle(curX, curY, this._circleDiameter, "#a5ff00");
            this.preX = curX;
            this.preY = curY
        }
        var point = { x:curX, y:curY} as Laya.Point;
        this.pointsHitTest(this._pointsArr,point);
        if(this._pointsArr.length/this._pointCount<=this._percentCover){
            this._maskPanel.displayObject.graphics.drawRect(0,0,this._maskPanel.width, this._maskPanel.height,"#000");
        }
    }
    private onMouseUp(evt: any): void {
        this.off(Laya.Event.MOUSE_MOVE, this, this.onMouseMove);
    }

    private _pointCount: number = 100;
    private _row: number = 10;
    private _col: number = 10;
    private _pointsArr: Array<Laya.Point> = [];
    private createPoints(width: number, height: number) {
        let widthSpan: number = Math.trunc(width / this._row),
            heightSpan: number = Math.trunc(height / this._col);
        for (let i = 0; i < this._row; i++) {
            for (let j = 0; j < this._col; j++) {
                let point = new Laya.Point(widthSpan * i, heightSpan * j);
                this._pointsArr.push(point);
            }
        }
    }

    private pointsHitTest(points:Array<Laya.Point>,source:Laya.Point):boolean {
        return points.some((point:Laya.Point,index:number)=>{
            if(point.distance(source.x,source.y)<=this._circleDiameter){
                points.splice(index,1);
                return true;
            }else{
                return false;
            }
        })
    }
    
}