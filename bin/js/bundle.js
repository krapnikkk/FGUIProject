(function () {
    'use strict';

    class Scratch extends fgui.GComponent {
        constructor() {
            super();
            this.preX = 0;
            this.preY = 0;
            this.firstBrush = true;
            this._circleDiameter = 40;
            this._percentCover = 0.5;
            this._pointCount = 100;
            this._row = 10;
            this._col = 10;
            this._pointsArr = [];
        }
        constructFromXML(xml) {
            super.constructFromXML(xml);
            this.on(Laya.Event.MOUSE_DOWN, this, this.onMouseDown);
            this.on(Laya.Event.MOUSE_UP, this, this.onMouseUp);
            this._panel = this.getChild("panel").asCom;
            this._maskPanel = this.getChild("mask").asCom;
        }
        onMouseDown(evt) {
            if (this._maskPanel) {
                if (this.firstBrush) {
                    this._maskPanel.displayObject.graphics.clear();
                    this.firstBrush = false;
                    this.createPoints(this._maskPanel.width, this._maskPanel.height);
                }
                this.preX = evt.target.mouseX;
                this.preY = evt.target.mouseY;
                this._maskPanel.displayObject.graphics.drawCircle(this.preX, this.preY, this._circleDiameter, "#a5ff00");
                this.on(Laya.Event.MOUSE_MOVE, this, this.onMouseMove);
            }
            if (this._panel) {
                this._panel.visible = false;
            }
        }
        onMouseMove(evt) {
            var curX = evt.target.mouseX;
            var curY = evt.target.mouseY;
            if (this._maskPanel) {
                this._maskPanel.displayObject.graphics.drawCircle(curX, curY, this._circleDiameter, "#a5ff00");
                this.preX = curX;
                this.preY = curY;
            }
            var point = { x: curX, y: curY };
            this.pointsHitTest(this._pointsArr, point);
            console.log(`${this._pointsArr.length}/${this._pointCount}`);
            if (this._pointsArr.length / this._pointCount <= this._percentCover) {
                this._maskPanel.displayObject.graphics.drawRect(0, 0, this._maskPanel.width, this._maskPanel.height, "#000");
            }
        }
        onMouseUp(evt) {
            this.off(Laya.Event.MOUSE_MOVE, this, this.onMouseMove);
        }
        createPoints(width, height) {
            let widthSpan = Math.trunc(width / this._row), heightSpan = Math.trunc(height / this._col);
            for (let i = 0; i < this._row; i++) {
                for (let j = 0; j < this._col; j++) {
                    let point = new Laya.Point(widthSpan * i, heightSpan * j);
                    this._pointsArr.push(point);
                }
            }
        }
        pointsHitTest(points, source) {
            return points.some((point, index) => {
                if (point.distance(source.x, source.y) <= this._circleDiameter) {
                    points.splice(index, 1);
                    return true;
                }
                else {
                    return false;
                }
            });
        }
    }

    class GameConfig {
        constructor() {
        }
        static init() {
            fgui.UIObjectFactory.setExtension("ui://ScratchCard/scratch", Scratch);
        }
    }
    GameConfig.width = 1920;
    GameConfig.height = 1080;
    GameConfig.scaleMode = "fixedwidth";
    GameConfig.screenMode = "none";
    GameConfig.alignV = "top";
    GameConfig.alignH = "left";
    GameConfig.startScene = "test/TestScene.scene";
    GameConfig.sceneRoot = "";
    GameConfig.debug = false;
    GameConfig.stat = false;
    GameConfig.physicsDebug = false;
    GameConfig.exportSceneToJson = true;
    GameConfig.init();

    class ScratchCard {
        constructor() {
            fgui.UIPackage.loadPackage("res/UI/ScratchCard", Laya.Handler.create(this, this.onUILoaded));
        }
        onUILoaded() {
            this._view = fgui.UIPackage.createObject("ScratchCard", "Main").asCom;
            this._view.makeFullScreen();
            fgui.GRoot.inst.addChild(this._view);
        }
        destroy() {
            fgui.UIPackage.removePackage("ScratchCard");
        }
    }

    class MainMenu {
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
        }
        startDemo(demoClass) {
            this._view.dispose();
            let demo = new demoClass();
            Laya.stage.event("start_demo", demo);
        }
        destroy() {
            this._view.dispose();
        }
    }

    class DemoEntry {
        constructor() {
            Laya.stage.on("start_demo", this, this.onDemoStart);
            this._currentDemo = new MainMenu();
        }
        onDemoStart(demo) {
            this._currentDemo = demo;
            this._closeButton = fgui.UIPackage.createObject("MainMenu", "CloseButton");
            this._closeButton.setXY(fgui.GRoot.inst.width - this._closeButton.width - 10, fgui.GRoot.inst.height - this._closeButton.height - 10);
            this._closeButton.addRelation(fgui.GRoot.inst, fgui.RelationType.Right_Right);
            this._closeButton.addRelation(fgui.GRoot.inst, fgui.RelationType.Bottom_Bottom);
            this._closeButton.sortingOrder = 100000;
            this._closeButton.onClick(this, this.onDemoClosed);
            fgui.GRoot.inst.addChild(this._closeButton);
        }
        onDemoClosed() {
            if (this._currentDemo.destroy)
                this._currentDemo.destroy();
            fgui.GRoot.inst.removeChildren(0, -1, true);
            this._currentDemo = new MainMenu();
        }
    }

    class Main {
        constructor() {
            if (window["Laya3D"])
                Laya3D.init(GameConfig.width, GameConfig.height);
            else
                Laya.init(GameConfig.width, GameConfig.height, Laya["WebGL"]);
            Laya["Physics"] && Laya["Physics"].enable();
            Laya["DebugPanel"] && Laya["DebugPanel"].enable();
            Laya.stage.scaleMode = GameConfig.scaleMode;
            Laya.stage.screenMode = GameConfig.screenMode;
            Laya.stage.alignV = GameConfig.alignV;
            Laya.stage.alignH = GameConfig.alignH;
            Laya.URL.exportSceneToJson = GameConfig.exportSceneToJson;
            if (GameConfig.debug || Laya.Utils.getQueryString("debug") == "true")
                Laya.enableDebugPanel();
            if (GameConfig.physicsDebug && Laya["PhysicsDebugDraw"])
                Laya["PhysicsDebugDraw"].enable();
            if (GameConfig.stat)
                Laya.Stat.show();
            Laya.alertGlobalError = true;
            Laya.ResourceVersion.enable("version.json", Laya.Handler.create(this, this.onVersionLoaded), Laya.ResourceVersion.FILENAME_VERSION);
        }
        onVersionLoaded() {
            Laya.AtlasInfoManager.enable("fileconfig.json", Laya.Handler.create(this, this.onConfigLoaded));
        }
        onConfigLoaded() {
            Laya.stage.addChild(fgui.GRoot.inst.displayObject);
            new DemoEntry();
        }
    }
    new Main();

}());
//# sourceMappingURL=bundle.js.map
