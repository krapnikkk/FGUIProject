
export default class Joystick extends fgui.GComponent {
    private _InitX: number;
    private _InitY: number;
    private _startStageX: number;
    private _startStageY: number;
    private _lastStageX: number;
    private _lastStageY: number;
    private _button: fgui.GButton;
    private _touchArea: fgui.GObject;
    private _thumb: fgui.GObject;
    private _center: fgui.GObject;
    private touchId: number;
    private _tweener: fgui.GTweener;
    private _curPos: Laya.Point;

    public static JoystickMoving: string = "JoystickMoving";
    public static JoystickUp: string = "JoystickUp";

    public radius: number;
    protected constructFromXML(xml: any): void {
        super.constructFromXML(xml);
        this._button = this.getChild("joystick").asButton;
        this._button.changeStateOnClick = false;
        this._thumb = this._button.getChild("thumb");

        this._touchArea = this.getChild("joystick_touch");
        this._center = this.getChild("joystick_center");
        this._InitX = this._center.x + this._center.width / 2;
        this._InitY = this._center.y + this._center.height / 2;

        this._touchArea.on(Laya.Event.MOUSE_DOWN, this, this.onTouchDown);
    }
    public constructor() {
        super();

        this.touchId = -1;
        this.radius = 60; // 半径

        this._curPos = new Laya.Point();

    }

    public Trigger(evt: Laya.Event): void {
        this.onTouchDown(evt);
    }

    private onTouchDown(evt: Laya.Event) {
        if (this.touchId == -1) {//First touch
            this.touchId = evt.touchId;

            if (this._tweener != null) {
                this._tweener.kill();
                this._tweener = null;
            }

            fgui.GRoot.inst.globalToLocal(Laya.stage.mouseX, Laya.stage.mouseY, this._curPos);
            var bx: number = this._curPos.x - this.x;
            var by: number = this._curPos.y - this.y;
            this._button.selected = true;

            if (bx < 0)
                bx = 0;
            else if (bx > this._touchArea.width)
                bx = this._touchArea.width;

            if (by > fgui.GRoot.inst.height)
                by = fgui.GRoot.inst.height;
            else if (by < this._touchArea.y)
                by = this._touchArea.y;

            this._lastStageX = bx;
            this._lastStageY = by;
            this._startStageX = bx;
            this._startStageY = by;

            this._center.visible = true;
            this._center.x = bx - this._center.width / 2;
            this._center.y = by - this._center.height / 2;
            this._button.x = bx - this._button.width / 2;
            this._button.y = by - this._button.height / 2;

            var deltaX: number = bx - this._InitX;
            var deltaY: number = by - this._InitY;
            var degrees: number = Math.atan2(deltaY, deltaX) * 180 / Math.PI;
            this._thumb.rotation = degrees + 90;

            Laya.stage.on(Laya.Event.MOUSE_MOVE, this, this.OnTouchMove);
            Laya.stage.on(Laya.Event.MOUSE_UP, this, this.OnTouchUp);
        }
    }

    private OnTouchUp(evt: Laya.Event): void {
        if (this.touchId != -1 && evt.touchId == this.touchId) {
            this.touchId = -1;
            this._thumb.rotation = this._thumb.rotation + 180;
            this._center.visible = false;
            this._tweener = fgui.GTween.to2(this._button.x, this._button.y, this._InitX - this._button.width / 2, this._InitY - this._button.height / 2, 0.3)
                .setTarget(this._button, this._button.setXY)
                .setEase(fgui.EaseType.CircOut)
                .onComplete(this.onTweenComplete, this);

            Laya.stage.off(Laya.Event.MOUSE_MOVE, this, this.OnTouchMove);
            Laya.stage.off(Laya.Event.MOUSE_UP, this, this.OnTouchUp);

            Laya.stage.event(Joystick.JoystickUp);
        }
    }

    private onTweenComplete(): void {
        this._tweener = null;
        this._button.selected = false;
        this._thumb.rotation = 0;
        this._center.visible = true;
        this._center.x = this._InitX - this._center.width / 2;
        this._center.y = this._InitY - this._center.height / 2;
    }

    private OnTouchMove(evt: Laya.Event): void {
        if (this.touchId != -1 && evt.touchId == this.touchId) {
            var bx: number = Laya.stage.mouseX - this.x;
            var by: number = Laya.stage.mouseY - this.y;
            var moveX: number = bx - this._lastStageX;
            var moveY: number = by - this._lastStageY;
            this._lastStageX = bx;
            this._lastStageY = by;
            var buttonX: number = this._button.x + moveX;
            var buttonY: number = this._button.y + moveY;

            var offsetX: number = buttonX + this._button.width / 2 - this._startStageX;
            var offsetY: number = buttonY + this._button.height / 2 - this._startStageY;

            var rad: number = Math.atan2(offsetY, offsetX);
            var degree: number = rad * 180 / Math.PI;
            this._thumb.rotation = degree + 90;

            var maxX: number = this.radius * Math.cos(rad);
            var maxY: number = this.radius * Math.sin(rad);
            if (Math.abs(offsetX) > Math.abs(maxX))
                offsetX = maxX;
            if (Math.abs(offsetY) > Math.abs(maxY))
                offsetY = maxY;

            buttonX = this._startStageX + offsetX;
            buttonY = this._startStageY + offsetY;
            if (buttonX < 0)
                buttonX = 0;
            if (buttonY > fgui.GRoot.inst.height)
                buttonY = fgui.GRoot.inst.height;

            this._button.x = buttonX - this._button.width / 2;
            this._button.y = buttonY - this._button.height / 2;
            let vector2 = new Laya.Vector2(offsetX, offsetY);
            Laya.stage.event(Joystick.JoystickMoving, { vector2, degree });
        }
    }
}
