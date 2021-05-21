import Joystick from "../extension/Joystick";

export default class MiniMapDemo {
    private _view: fgui.GComponent;
    private _map: fairygui.GComponent;
    private _mapSign: fairygui.GComponent;
    private _role: fairygui.GComponent;
    private _bg: fairygui.GComponent;

    private _onPress: boolean = false;
    constructor() {
        fgui.UIPackage.loadPackage("res/UI/MiniMap", Laya.Handler.create(this, this.onUILoaded));
    }

    onUILoaded() {
        this._view = fgui.UIPackage.createObject("MiniMap", "Main") as fairygui.GComponent;
        this._view.makeFullScreen();
        fgui.GRoot.inst.addChild(this._view);
        this._map = this._view.getChild("map").asCom;
        this._mapSign = this._map.getChild("sign").asCom;
        this._role = this._view.getChild("role").asCom;
        this._bg = this._view.getChild("bg").asCom;
        Laya.timer.callLater(this, this.createMiniMap);
        Laya.stage.on(Joystick.JoystickMoving, this, this.onTouchMove);
        Laya.stage.on(Joystick.JoystickUp, this, this.onTouchUp);
        Laya.timer.frameLoop(1, this, this.onFrame);

    }

    private bgTexture: Laya.Texture;
    private miniMapRatio: number = 1;
    createMiniMap() {
        let bg = this._view.getChild("bg");
        // bg.displayObject.repaint();
        let { x, y, width, height } = bg;
        let htmlCanvas = bg.displayObject.drawToCanvas(width, height, x, y);
        this.bgTexture = htmlCanvas.getTexture();
        this._map.displayObject.graphics.drawTexture(this.bgTexture, 0, 0, this._map.width, this._map.height);
        this.miniMapRatio = this._map.width / width;
    }


    private _roleVector: Laya.Vector2 = new Laya.Vector2();
    private _speed: number = 0.05;
    onTouchMove(evt: { [key: string]: any }) {
        this._onPress = true;
        let { degree, vector2 } = evt;
        degree += 90;
        this._role.rotation = degree;
        this._mapSign.rotation = degree;
        this._roleVector = vector2;
    }

    onTouchUp() {
        this._onPress = false;
    }

    onFrame() {
        if (this._onPress) {
            let { x, y } = this._roleVector;
            let sx = x * this._speed, sy = y * this._speed;
            if (this._role.x  + sx >= this._bg.x && this._role.x + this._role.width + sx < this._bg.x + this._bg.width) {
                this._role.x += sx;
                this._mapSign.x += (sx * this.miniMapRatio);
            }

            if (this._role.y  + sy >= this._bg.y && this._role.y + this._role.height + sy < this._bg.y + this._bg.height) {
                this._role.y += sy;
                this._mapSign.y += (sy * this.miniMapRatio);
            }
        }
    }

    destroy() {
        Laya.stage.off(Joystick.JoystickMoving, this, this.onTouchMove);
        Laya.stage.off(Joystick.JoystickUp, this, this.onTouchUp);
        Laya.timer.clear(this, this.onFrame);
        this._view.dispose();
        fgui.UIPackage.removePackage("MiniMap");
    }
}
