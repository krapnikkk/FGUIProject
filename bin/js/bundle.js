var __extends = (this && this.__extends) || (function () {
    var extendStatics = Object.setPrototypeOf ||
        ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
        function (d, b) { for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p]; };
    return function (d, b) {
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
(function(){function r(e,n,t){function o(i,f){if(!n[i]){if(!e[i]){var c="function"==typeof require&&require;if(!f&&c)return c(i,!0);if(u)return u(i,!0);var a=new Error("Cannot find module '"+i+"'");throw a.code="MODULE_NOT_FOUND",a}var p=n[i]={exports:{}};e[i][0].call(p.exports,function(r){var n=e[i][1][r];return o(n||r)},p,p.exports,r,e,n,t)}return n[i].exports}for(var u="function"==typeof require&&require,i=0;i<t.length;i++)o(t[i]);return o}return r})()({1:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/*
* 游戏初始化配置;
*/
var GameConfig = /** @class */ (function () {
    function GameConfig() {
    }
    GameConfig.init = function () {
    };
    GameConfig.width = document.body.clientWidth;
    GameConfig.height = document.body.clientHeight;
    GameConfig.scaleMode = "fixedwidth";
    GameConfig.screenMode = "none";
    // static startScene:string="test/TestScene.scene";
    GameConfig.sceneRoot = "";
    GameConfig.debug = false;
    GameConfig.stat = false;
    GameConfig.physicsDebug = false;
    GameConfig.exportSceneToJson = true;
    return GameConfig;
}());
exports.default = GameConfig;
GameConfig.init();
},{}],2:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var GameConfig_1 = require("./GameConfig");
var MainPanel_1 = require("./MainPanel");
var Handler = laya.utils.Handler;
var Loader = laya.net.Loader;
var Main = /** @class */ (function () {
    function Main() {
        //根据IDE设置初始化引擎		
        if (window["Laya3D"])
            Laya3D.init(GameConfig_1.default.width, GameConfig_1.default.height);
        else
            Laya.init(GameConfig_1.default.width, GameConfig_1.default.height, Laya["WebGL"]);
        Laya["Physics"] && Laya["Physics"].enable();
        Laya["DebugPanel"] && Laya["DebugPanel"].enable();
        Laya.stage.scaleMode = GameConfig_1.default.scaleMode;
        Laya.stage.screenMode = GameConfig_1.default.screenMode;
        //兼容微信不支持加载scene后缀场景
        Laya.URL.exportSceneToJson = GameConfig_1.default.exportSceneToJson;
        //打开调试面板（通过IDE设置调试模式，或者url地址增加debug=true参数，均可打开调试面板）
        if (GameConfig_1.default.debug || Laya.Utils.getQueryString("debug") == "true")
            Laya.enableDebugPanel();
        if (GameConfig_1.default.physicsDebug && Laya["PhysicsDebugDraw"])
            Laya["PhysicsDebugDraw"].enable();
        if (GameConfig_1.default.stat)
            Laya.Stat.show();
        Laya.alertGlobalError = true;
        //激活资源版本控制，version.json由IDE发布功能自动生成，如果没有也不影响后续流程
        Laya.ResourceVersion.enable("version.json", Laya.Handler.create(this, this.onVersionLoaded), Laya.ResourceVersion.FILENAME_VERSION);
    }
    Main.prototype.onVersionLoaded = function () {
        //激活大小图映射，加载小图的时候，如果发现小图在大图合集里面，则优先加载大图合集，而不是小图
        Laya.AtlasInfoManager.enable("fileconfig.json", Laya.Handler.create(this, this.onConfigLoaded));
    };
    Main.prototype.onConfigLoaded = function () {
        //加载IDE指定的场景
        // GameConfig.startScene && Laya.Scene.open(GameConfig.startScene);
        Laya.loader.load([
            { url: "res/Basic_atlas0.png", type: Loader.IMAGE },
            { url: "res/Basic.fui", type: Loader.BUFFER }
        ], Handler.create(this, this.onLoaded));
    };
    Main.prototype.onLoaded = function () {
        Laya.stage.addChild(fairygui.GRoot.inst.displayObject);
        fairygui.UIPackage.addPackage("res/Basic");
        fairygui.UIConfig.defaultFont = "Microsoft YaHei";
        fairygui.UIConfig.verticalScrollBar = "ui://Basic/ScrollBar_VT";
        fairygui.UIConfig.horizontalScrollBar = "ui://Basic/ScrollBar_HZ";
        fairygui.UIConfig.popupMenu = "ui://Basic/PopupMenu";
        new MainPanel_1.default();
    };
    return Main;
}());
//激活启动类
new Main();
},{"./GameConfig":1,"./MainPanel":3}],3:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var MainPanel = /** @class */ (function () {
    function MainPanel() {
        this._view = fairygui.UIPackage.createObject("Basic", "Main").asCom;
        var scaleRatio = this._view.width / document.body.clientWidth;
        this._view.width = document.body.clientWidth;
        this._view.height = this._view.height * scaleRatio;
        this._view.setSize(fairygui.GRoot.inst.width, fairygui.GRoot.inst.height);
        fairygui.GRoot.inst.addChild(this._view);
        this._backBtn = this._view.getChild("btn_Back");
        this._backBtn.visible = false;
        this._backBtn.onClick(this, this.onClickBack);
        this._demoContainer = this._view.getChild("container").asCom;
        this._cc = this._view.getController("c1");
        var cnt = this._view.numChildren;
        for (var i = 0; i < cnt; i++) {
            var obj = this._view.getChildAt(i);
            if (obj.group != null && obj.group.name == "btns")
                obj.onClick(this, this.runDemo);
        }
        this._demoObjects = {};
    }
    MainPanel.prototype.update = function () {
        this._view.getChild("n33").rotation += 5;
        this._view.getChild("n34").displayObject.rotation += 5;
    };
    MainPanel.prototype.runDemo = function (evt) {
        var type = fairygui.GObject.cast(evt.currentTarget).name.substr(4);
        var obj = this._demoObjects[type];
        if (obj == null) {
            obj = fairygui.UIPackage.createObject("Basic", "Demo_" + type).asCom;
            this._demoObjects[type] = obj;
        }
        this._demoContainer.removeChildren();
        this._demoContainer.addChild(obj);
        this._cc.selectedIndex = 1;
        this._backBtn.visible = true;
        switch (type) {
            case "Button":
                this.playButton();
                break;
            case "Text":
                this.playText();
                break;
            case "Window":
                this.playWindow();
                break;
            case "Popup":
                this.playPopup();
                break;
            case "Drag&Drop":
                this.playDragDrop();
                break;
            case "Depth":
                this.playDepth();
                break;
            case "Grid":
                this.playGrid();
                break;
            case "ProgressBar":
                this.playProgressBar();
                break;
        }
    };
    MainPanel.prototype.onClickBack = function (evt) {
        this._cc.selectedIndex = 0;
        this._backBtn.visible = false;
    };
    //------------------------------
    MainPanel.prototype.playButton = function () {
        var obj = this._demoObjects["Button"];
        obj.getChild("n34").onClick(this, this.__clickButton);
    };
    MainPanel.prototype.__clickButton = function () {
        console.log("click button");
    };
    //------------------------------
    MainPanel.prototype.playText = function () {
        var obj = this._demoObjects["Text"];
        obj.getChild("n12").on(laya.events.Event.LINK, this, this.__clickLink);
        obj.getChild("n22").onClick(this, this.__clickGetInput);
    };
    MainPanel.prototype.__clickLink = function (link) {
        var obj = this._demoObjects["Text"];
        obj.getChild("n12").text = "[img]ui://9leh0eyft9fj5f[/img][color=#FF0000]你点击了链接[/color]：" + link;
    };
    MainPanel.prototype.__clickGetInput = function () {
        var obj = this._demoObjects["Text"];
        obj.getChild("n21").text = obj.getChild("n19").text;
    };
    MainPanel.prototype.playWindow = function () {
        var obj = this._demoObjects["Window"];
        obj.getChild("n0").onClick(this, this.__clickWindowA);
        obj.getChild("n1").onClick(this, this.__clickWindowB);
    };
    MainPanel.prototype.__clickWindowA = function () {
        if (this._winA == null)
            this._winA = new WindowA();
        this._winA.show();
    };
    MainPanel.prototype.__clickWindowB = function () {
        if (this._winB == null)
            this._winB = new WindowB();
        this._winB.show();
    };
    MainPanel.prototype.playPopup = function () {
        if (this._pm == null) {
            this._pm = new fairygui.PopupMenu();
            this._pm.addItem("Item 1");
            this._pm.addItem("Item 2");
            this._pm.addItem("Item 3");
            this._pm.addItem("Item 4");
            if (this._popupCom == null) {
                this._popupCom = fairygui.UIPackage.createObject("Basic", "Component12").asCom;
                this._popupCom.center();
            }
        }
        var obj = this._demoObjects["Popup"];
        var btn = obj.getChild("n3");
        btn.onClick(this, this.__clickPopup1);
        var btn2 = obj.getChild("n5");
        btn2.onClick(this, this.__clickPopup2);
    };
    MainPanel.prototype.__clickPopup1 = function (evt) {
        var btn = fairygui.GObject.cast(evt.currentTarget);
        this._pm.show(btn, true);
    };
    MainPanel.prototype.__clickPopup2 = function () {
        fairygui.GRoot.inst.showPopup(this._popupCom);
    };
    //------------------------------
    MainPanel.prototype.playDragDrop = function () {
        var obj = this._demoObjects["Drag&Drop"];
        var btnA = obj.getChild("a");
        btnA.draggable = true;
        var btnB = obj.getChild("b").asButton;
        btnB.draggable = true;
        btnB.on(fairygui.Events.DRAG_START, this, this.__onDragStart);
        var btnC = obj.getChild("c").asButton;
        btnC.icon = null;
        btnC.on(fairygui.Events.DROP, this, this.__onDrop);
        var btnD = obj.getChild("d");
        btnD.draggable = true;
        var bounds = obj.getChild("bounds");
        var rect = new laya.maths.Rectangle();
        bounds.localToGlobalRect(0, 0, bounds.width, bounds.height, rect);
        fairygui.GRoot.inst.globalToLocalRect(rect.x, rect.y, rect.width, rect.height, rect);
        //因为这时候面板还在从右往左动，所以rect不准确，需要用相对位置算出最终停下来的范围
        rect.x -= obj.parent.x;
        btnD.dragBounds = rect;
    };
    MainPanel.prototype.__onDragStart = function (evt) {
        var btn = fairygui.GObject.cast(evt.currentTarget);
        btn.stopDrag(); //取消对原目标的拖动，换成一个替代品
        fairygui.DragDropManager.inst.startDrag(btn, btn.icon, btn.icon);
    };
    MainPanel.prototype.__onDrop = function (data, evt) {
        var btn = fairygui.GObject.cast(evt.currentTarget);
        btn.icon = data;
    };
    //------------------------------
    MainPanel.prototype.playDepth = function () {
        var obj = this._demoObjects["Depth"];
        var testContainer = obj.getChild("n22").asCom;
        var fixedObj = testContainer.getChild("n0");
        fixedObj.sortingOrder = 100;
        fixedObj.draggable = true;
        var numChildren = testContainer.numChildren;
        var i = 0;
        while (i < numChildren) {
            var child = testContainer.getChildAt(i);
            if (child != fixedObj) {
                testContainer.removeChildAt(i);
                numChildren--;
            }
            else
                i++;
        }
        var startPos = new laya.maths.Point(fixedObj.x, fixedObj.y);
        obj.getChild("btn0").onClick(this, this.__click1, [obj, startPos]);
        obj.getChild("btn1").onClick(this, this.__click2, [obj, startPos]);
    };
    MainPanel.prototype.__click1 = function (obj, startPos) {
        var graph = new fairygui.GGraph();
        startPos.x += 10;
        startPos.y += 10;
        graph.setXY(startPos.x, startPos.y);
        graph.setSize(150, 150);
        graph.drawRect(1, "#000000", "#FF0000");
        obj.getChild("n22").asCom.addChild(graph);
    };
    MainPanel.prototype.__click2 = function (obj, startPos) {
        var obj = this._demoObjects["Depth"];
        var graph = new fairygui.GGraph();
        startPos.x += 10;
        startPos.y += 10;
        graph.setXY(startPos.x, startPos.y);
        graph.setSize(150, 150);
        graph.drawRect(1, "#000000", "#00FF00");
        graph.sortingOrder = 200;
        obj.getChild("n22").asCom.addChild(graph);
    };
    //------------------------------
    MainPanel.prototype.playGrid = function () {
        var obj = this._demoObjects["Grid"];
        var list1 = obj.getChild("list1").asList;
        list1.removeChildrenToPool();
        var testNames = ["苹果手机操作系统", "安卓手机操作系统", "微软手机操作系统", "微软桌面操作系统", "苹果桌面操作系统", "未知操作系统"];
        var testColors = [0xFFFF00, 0xFF0000, 0xFFFFFF, 0x0000FF];
        var cnt = testNames.length;
        for (var i = 0; i < cnt; i++) {
            var item = list1.addItemFromPool().asButton;
            item.getChild("t0").text = "" + (i + 1);
            item.getChild("t1").text = testNames[i];
            item.getChild("t2").asTextField.color = laya.utils.Utils.toHexColor(testColors[Math.floor(Math.random() * 4)]);
            item.getChild("star").asProgress.value = (Math.floor(Math.random() * 3) + 1) / 3 * 100;
        }
        var list2 = obj.getChild("list2").asList;
        list2.removeChildrenToPool();
        for (var i = 0; i < cnt; i++) {
            var item = list2.addItemFromPool().asButton;
            item.getChild("cb").asButton.selected = false;
            item.getChild("t1").text = testNames[i];
            item.getChild("mc").asMovieClip.playing = i % 2 == 0;
            item.getChild("t3").text = "" + Math.floor(Math.random() * 10000);
        }
    };
    //---------------------------------------------
    MainPanel.prototype.playProgressBar = function () {
        var obj = this._demoObjects["ProgressBar"];
        Laya.timer.frameLoop(2, this, this.__playProgress);
        obj.on(laya.events.Event.UNDISPLAY, this, this.__removeTimer);
    };
    MainPanel.prototype.__removeTimer = function () {
        Laya.timer.clear(this, this.__playProgress);
    };
    MainPanel.prototype.__playProgress = function () {
        var obj = this._demoObjects["ProgressBar"];
        var cnt = obj.numChildren;
        for (var i = 0; i < cnt; i++) {
            var child = obj.getChildAt(i);
            if (child != null) {
                child.value += 1;
                if (child.value > child.max)
                    child.value = 0;
            }
        }
    };
    return MainPanel;
}());
exports.default = MainPanel;
},{}]},{},[2])
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uLy4uL1Byb2dyYW0gRmlsZXMvTGF5YUFpcklERV9iZXRhL3Jlc291cmNlcy9hcHAvbm9kZV9tb2R1bGVzL2Jyb3dzZXItcGFjay9fcHJlbHVkZS5qcyIsInNyYy9HYW1lQ29uZmlnLnRzIiwic3JjL01haW4udHMiLCJzcmMvTWFpblBhbmVsLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7OztBQ1ZBOztFQUVFO0FBQ0Y7SUFXSTtJQUFjLENBQUM7SUFDUixlQUFJLEdBQVg7SUFFQSxDQUFDO0lBYk0sZ0JBQUssR0FBUSxRQUFRLENBQUMsSUFBSSxDQUFDLFdBQVcsQ0FBQztJQUN2QyxpQkFBTSxHQUFRLFFBQVEsQ0FBQyxJQUFJLENBQUMsWUFBWSxDQUFDO0lBQ3pDLG9CQUFTLEdBQVEsWUFBWSxDQUFDO0lBQzlCLHFCQUFVLEdBQVEsTUFBTSxDQUFDO0lBQ2hDLG1EQUFtRDtJQUM1QyxvQkFBUyxHQUFRLEVBQUUsQ0FBQztJQUNwQixnQkFBSyxHQUFTLEtBQUssQ0FBQztJQUNwQixlQUFJLEdBQVMsS0FBSyxDQUFDO0lBQ25CLHVCQUFZLEdBQVMsS0FBSyxDQUFDO0lBQzNCLDRCQUFpQixHQUFTLElBQUksQ0FBQztJQUsxQyxpQkFBQztDQWZELEFBZUMsSUFBQTtrQkFmb0IsVUFBVTtBQWdCL0IsVUFBVSxDQUFDLElBQUksRUFBRSxDQUFDOzs7O0FDbkJsQiwyQ0FBc0M7QUFDdEMseUNBQW9DO0FBQ3BDLElBQU8sT0FBTyxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsT0FBTyxDQUFDO0FBQ3BDLElBQU8sTUFBTSxHQUFHLElBQUksQ0FBQyxHQUFHLENBQUMsTUFBTSxDQUFDO0FBQ2hDO0lBQ0M7UUFDQyxnQkFBZ0I7UUFDaEIsSUFBSSxNQUFNLENBQUMsUUFBUSxDQUFDO1lBQUUsTUFBTSxDQUFDLElBQUksQ0FBQyxvQkFBVSxDQUFD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VSxDQUFDLEVBQUUsQ0FBQyxHQUFHLEdBQUcsRUFBRSxDQUFDLEVBQUUsRUFDbkM7WUFDSSxJQUFJLEtBQUssR0FBeUIsR0FBRyxDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQTBCLENBQUM7WUFDN0UsSUFBSSxLQUFLLElBQUksSUFBSSxFQUNqQjtnQkFDSSxLQUFLLENBQUMsS0FBSyxJQUFJLENBQUMsQ0FBQztnQkFDakIsSUFBSSxLQUFLLENBQUMsS0FBSyxHQUFHLEtBQUssQ0FBQyxHQUFHO29CQUN2QixLQUFLLENBQUMsS0FBSyxHQUFHLENBQUMsQ0FBQzthQUN2QjtTQUNKO0lBQ0wsQ0FBQztJQUNMLGdCQUFDO0FBQUQsQ0E1VEEsQUE0VEMsSUFBQSIsImZpbGUiOiJnZW5lcmF0ZWQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlc0NvbnRlbnQiOlsidmFyIF9fZXh0ZW5kcyA9ICh0aGlzICYmIHRoaXMuX19leHRlbmRzKSB8fCAoZnVuY3Rpb24gKCkge1xyXG4gICAgdmFyIGV4dGVuZFN0YXRpY3MgPSBPYmplY3Quc2V0UHJvdG90eXBlT2YgfHxcclxuICAgICAgICAoeyBfX3Byb3RvX186IFtdIH0gaW5zdGFuY2VvZiBBcnJheSAmJiBmdW5jdGlvbiAoZCwgYikgeyBkLl9fcHJvdG9fXyA9IGI7IH0pIHx8XHJcbiAgICAgICAgZnVuY3Rpb24gKGQsIGIpIHsgZm9yICh2YXIgcCBpbiBiKSBpZiAoYi5oYXNPd25Qcm9wZXJ0eShwKSkgZFtwXSA9IGJbcF07IH07XHJcbiAgICByZXR1cm4gZnVuY3Rpb24gKGQsIGIpIHtcclxuICAgICAgICBleHRlbmRTdGF0aWNzKGQsIGIpO1xyXG4gICAgICAgIGZ1bmN0aW9uIF9fKCkgeyB0aGlzLmNvbnN0cnVjdG9yID0gZDsgfVxyXG4gICAgICAgIGQucHJvdG90eXBlID0gYiA9PT0gbnVsbCA/IE9iamVjdC5jcmVhdGUoYikgOiAoX18ucHJvdG90eXBlID0gYi5wcm90b3R5cGUsIG5ldyBfXygpKTtcclxuICAgIH07XHJcbn0pKCk7XHJcbihmdW5jdGlvbigpe2Z1bmN0aW9uIHIoZSxuLHQpe2Z1bmN0aW9uIG8oaSxmKXtpZighbltpXSl7aWYoIWVbaV0pe3ZhciBjPVwiZnVuY3Rpb25cIj09dHlwZW9mIHJlcXVpcmUmJnJlcXVpcmU7aWYoIWYmJmMpcmV0dXJuIGMoaSwhMCk7aWYodSlyZXR1cm4gdShpLCEwKTt2YXIgYT1uZXcgRXJyb3IoXCJDYW5ub3QgZmluZCBtb2R1bGUgJ1wiK2krXCInXCIpO3Rocm93IGEuY29kZT1cIk1PRFVMRV9OT1RfRk9VTkRcIixhfXZhciBwPW5baV09e2V4cG9ydHM6e319O2VbaV1bMF0uY2FsbChwLmV4cG9ydHMsZnVuY3Rpb24ocil7dmFyIG49ZVtpXVsxXVtyXTtyZXR1cm4gbyhufHxyKX0scCxwLmV4cG9ydHMscixlLG4sdCl9cmV0dXJuIG5baV0uZXhwb3J0c31mb3IodmFyIHU9XCJmdW5jdGlvblwiPT10eXBlb2YgcmVxdWlyZSYmcmVxdWlyZSxpPTA7aTx0Lmxlbmd0aDtpKyspbyh0W2ldKTtyZXR1cm4gb31yZXR1cm4gcn0pKCkiLCIvKlxyXG4qIOa4uOaIj+WIneWni+WMlumFjee9rjtcclxuKi9cclxuZXhwb3J0IGRlZmF1bHQgY2xhc3MgR2FtZUNvbmZpZ3tcclxuICAgIHN0YXRpYyB3aWR0aDpudW1iZXI9ZG9jdW1lbnQuYm9keS5jbGllbnRXaWR0aDtcclxuICAgIHN0YXRpYyBoZWlnaHQ6bnVtYmVyPWRvY3VtZW50LmJvZHkuY2xpZW50SGVpZ2h0O1xyXG4gICAgc3RhdGljIHNjYWxlTW9kZTpzdHJpbmc9XCJmaXhlZHdpZHRoXCI7XHJcbiAgICBzdGF0aWMgc2NyZWVuTW9kZTpzdHJpbmc9XCJub25lXCI7XHJcbiAgICAvLyBzdGF0aWMgc3RhcnRTY2VuZTpzdHJpbmc9XCJ0ZXN0L1Rlc3RTY2VuZS5zY2VuZVwiO1xyXG4gICAgc3RhdGljIHNjZW5lUm9vdDpzdHJpbmc9XCJcIjtcclxuICAgIHN0YXRpYyBkZWJ1Zzpib29sZWFuPWZhbHNlO1xyXG4gICAgc3RhdGljIHN0YXQ6Ym9vbGVhbj1mYWxzZTtcclxuICAgIHN0YXRpYyBwaHlzaWNzRGVidWc6Ym9vbGVhbj1mYWxzZTtcclxuICAgIHN0YXRpYyBleHBvcnRTY2VuZVRvSnNvbjpib29sZWFuPXRydWU7XHJcbiAgICBjb25zdHJ1Y3Rvcigpe31cclxuICAgIHN0YXRpYyBpbml0KCl7XHJcbiAgICAgICAgXHJcbiAgICB9XHJcbn1cclxuR2FtZUNvbmZpZy5pbml0KCk7IiwiaW1wb3J0IEdhbWVDb25maWcgZnJvbSBcIi4vR2FtZUNvbmZpZ1wiO1xyXG5pbXBvcnQgTWFpblBhbmVsIGZyb20gXCIuL01haW5QYW5lbFwiO1xyXG5pbXBvcnQgSGFuZGxlciA9IGxheWEudXRpbHMuSGFuZGxlcjtcclxuaW1wb3J0IExvYWRlciA9IGxheWEubmV0LkxvYWRlcjtcclxuY2xhc3MgTWFpbiB7XHJcblx0Y29uc3RydWN0b3IoKSB7XHJcblx0XHQvL+agueaNrklEReiuvue9ruWIneWni+WMluW8leaTjlx0XHRcclxuXHRcdGlmICh3aW5kb3dbXCJMYXlhM0RcIl0pIExheWEzRC5pbml0KEdhbWVDb25maWcud2lkdGgsIEdhbWVDb25maWcuaGVpZ2h0KTtcclxuXHRcdGVsc2UgTGF5YS5pbml0KEdhbWVDb25maWcud2lkdGgsIEdhbWVDb25maWcuaGVpZ2h0LCBMYXlhW1wiV2ViR0xcIl0pO1xyXG5cdFx0TGF5YVtcIlBoeXNpY3NcIl0gJiYgTGF5YVtcIlBoeXNpY3NcIl0uZW5hYmxlKCk7XHJcblx0XHRMYXlhW1wiRGVidWdQYW5lbFwiXSAmJiBMYXlhW1wiRGVidWdQYW5lbFwiXS5lbmFibGUoKTtcclxuXHRcdExheWEuc3RhZ2Uuc2NhbGVNb2RlID0gR2FtZUNvbmZpZy5zY2FsZU1vZGU7XHJcblx0XHRMYXlhLnN0YWdlLnNjcmVlbk1vZGUgPSBHYW1lQ29uZmlnLnNjcmVlbk1vZGU7XHJcblx0XHQvL+WFvOWuueW+ruS/oeS4jeaUr+aMgeWKoOi9vXNjZW5l5ZCO57yA5Zy65pmvXHJcblx0XHRMYXlhLlVSTC5leHBvcnRTY2VuZVRvSnNvbiA9IEdhbWVDb25maWcuZXhwb3J0U2NlbmVUb0pzb247XHJcblxyXG5cdFx0Ly/miZPlvIDosIPor5XpnaLmnb/vvIjpgJrov4dJREXorr7nva7osIPor5XmqKHlvI/vvIzmiJbogIV1cmzlnLDlnYDlop7liqBkZWJ1Zz10cnVl5Y+C5pWw77yM5Z2H5Y+v5omT5byA6LCD6K+V6Z2i5p2/77yJXHJcblx0XHRpZiAoR2FtZUNvbmZpZy5kZWJ1ZyB8fCBMYXlhLlV0aWxzLmdldFF1ZXJ5U3RyaW5nKFwiZGVidWdcIikgPT0gXCJ0cnVlXCIpIExheWEuZW5hYmxlRGVidWdQYW5lbCgpO1xyXG5cdFx0aWYgKEdhbWVDb25maWcucGh5c2ljc0RlYnVnICYmIExheWFbXCJQaHlzaWNzRGVidWdEcmF3XCJdKSBMYXlhW1wiUGh5c2ljc0RlYnVnRHJhd1wiXS5lbmFibGUoKTtcclxuXHRcdGlmIChHYW1lQ29uZmlnLnN0YXQpIExheWEuU3RhdC5zaG93KCk7XHJcblx0XHRMYXlhLmFsZXJ0R2xvYmFsRXJyb3IgPSB0cnVlO1xyXG5cclxuXHRcdC8v5r+A5rS76LWE5rqQ54mI5pys5o6n5Yi277yMdmVyc2lvbi5qc29u55SxSURF5Y+R5biD5Yqf6IO96Ieq5Yqo55Sf5oiQ77yM5aaC5p6c5rKh5pyJ5Lmf5LiN5b2x5ZON5ZCO57ut5rWB56iLXHJcblx0XHRMYXlhLlJlc291cmNlVmVyc2lvbi5lbmFibGUoXCJ2ZXJzaW9uLmpzb25cIiwgTGF5YS5IYW5kbGVyLmNyZWF0ZSh0aGlzLCB0aGlzLm9uVmVyc2lvbkxvYWRlZCksIExheWEuUmVzb3VyY2VWZXJzaW9uLkZJTEVOQU1FX1ZFUlNJT04pO1xyXG5cdH1cclxuXHJcblx0b25WZXJzaW9uTG9hZGVkKCk6IHZvaWQge1xyXG5cdFx0Ly/mv4DmtLvlpKflsI/lm77mmKDlsITvvIzliqDovb3lsI/lm77nmoTml7blgJnvvIzlpoLmnpzlj5HnjrDlsI/lm77lnKjlpKflm77lkIjpm4bph4zpnaLvvIzliJnkvJjlhYjliqDovb3lpKflm77lkIjpm4bvvIzogIzkuI3mmK/lsI/lm75cclxuXHRcdExheWEuQXRsYXNJbmZvTWFuYWdlci5lbmFibGUoXCJmaWxlY29uZmlnLmpzb25cIiwgTGF5YS5IYW5kbGVyLmNyZWF0ZSh0aGlzLCB0aGlzLm9uQ29uZmlnTG9hZGVkKSk7XHJcblx0fVxyXG5cclxuXHRvbkNvbmZpZ0xvYWRlZCgpOiB2b2lkIHtcclxuXHRcdC8v5Yqg6L29SURF5oyH5a6a55qE5Zy65pmvXHJcblx0XHQvLyBHYW1lQ29uZmlnLnN0YXJ0U2NlbmUgJiYgTGF5YS5TY2VuZS5vcGVuKEdhbWVDb25maWcuc3RhcnRTY2VuZSk7XHJcblx0XHRMYXlhLmxvYWRlci5sb2FkKFtcclxuXHRcdFx0eyB1cmw6IFwicmVzL0Jhc2ljX2F0bGFzMC5wbmdcIiwgdHlwZTogTG9hZGVyLklNQUdFIH0sXHJcblx0XHRcdHsgdXJsOiBcInJlcy9CYXNpYy5mdWlcIiwgdHlwZTogTG9hZGVyLkJVRkZFUiB9XHJcblx0XHRcdF0sIEhhbmRsZXIuY3JlYXRlKHRoaXMsIHRoaXMub25Mb2FkZWQpKTtcclxuXHR9XHJcblx0XHJcblx0b25Mb2FkZWQoKTogdm9pZCB7XHJcbiAgICAgICAgTGF5YS5zdGFnZS5hZGRDaGlsZChmYWlyeWd1aS5HUm9vdC5pbnN0LmRpc3BsYXlPYmplY3QpO1xyXG5cclxuICAgICAgICBmYWlyeWd1aS5VSVBhY2thZ2UuYWRkUGFja2FnZShcInJlcy9CYXNpY1wiKTtcdFx0XHJcbiAgICAgICAgZmFpcnlndWkuVUlDb25maWcuZGVmYXVsdEZvbnQgPSBcIk1pY3Jvc29mdCBZYUhlaVwiO1xyXG4gICAgICAgIGZhaXJ5Z3VpLlVJQ29uZmlnLnZlcnRpY2FsU2Nyb2xsQmFyID0gXCJ1aTovL0Jhc2ljL1Njcm9sbEJhcl9WVFwiO1xyXG4gICAgICAgIGZhaXJ5Z3VpLlVJQ29uZmlnLmhvcml6b250YWxTY3JvbGxCYXIgPSBcInVpOi8vQmFzaWMvU2Nyb2xsQmFyX0haXCI7XHJcbiAgICAgICAgZmFpcnlndWkuVUlDb25maWcucG9wdXBNZW51ID0gXCJ1aTovL0Jhc2ljL1BvcHVwTWVudVwiO1xyXG5cclxuICAgICAgICBuZXcgTWFpblBhbmVsKCk7XHJcbiAgICB9XHJcbn1cclxuLy/mv4DmtLvlkK/liqjnsbtcclxubmV3IE1haW4oKTtcclxuIiwiZXhwb3J0IGRlZmF1bHQgY2xhc3MgTWFpblBhbmVsIHtcclxuICAgIHByaXZhdGUgX3ZpZXc6IGZhaXJ5Z3VpLkdDb21wb25lbnQ7XHJcbiAgICBwcml2YXRlIF9iYWNrQnRuOiBmYWlyeWd1aS5HT2JqZWN0O1xyXG4gICAgcHJpdmF0ZSBfZGVtb0NvbnRhaW5lcjogZmFpcnlndWkuR0NvbXBvbmVudDtcclxuICAgIHByaXZhdGUgX2NjOiBmYWlyeWd1aS5Db250cm9sbGVyO1xyXG5cclxuICAgIHByaXZhdGUgX2RlbW9PYmplY3RzOiBhbnk7XHJcblxyXG4gICAgcHVibGljIGNvbnN0cnVjdG9yKCkge1xyXG4gICAgICAgIHRoaXMuX3ZpZXcgPSBmYWlyeWd1aS5VSVBhY2thZ2UuY3JlYXRlT2JqZWN0KFwiQmFzaWNcIiwgXCJNYWluXCIpLmFzQ29tO1xyXG4gICAgICAgIHZhciBzY2FsZVJhdGlvID0gdGhpcy5fdmlldy53aWR0aC9kb2N1bWVudC5ib2R5LmNsaWVudFdpZHRoO1xyXG4gICAgICAgIHRoaXMuX3ZpZXcud2lkdGggPSBkb2N1bWVudC5ib2R5LmNsaWVudFdpZHRoO1xyXG4gICAgICAgIHRoaXMuX3ZpZXcuaGVpZ2h0ID0gdGhpcy5fdmlldy5oZWlnaHQqc2NhbGVSYXRpbztcclxuICAgICAgICB0aGlzLl92aWV3LnNldFNpemUoZmFpcnlndWkuR1Jvb3QuaW5zdC53aWR0aCxmYWlyeWd1aS5HUm9vdC5pbnN0LmhlaWdodCk7XHJcbiAgICAgICAgZmFpcnlndWkuR1Jvb3QuaW5zdC5hZGRDaGlsZCh0aGlzLl92aWV3KTtcclxuXHJcbiAgICAgICAgdGhpcy5fYmFja0J0biA9IHRoaXMuX3ZpZXcuZ2V0Q2hpbGQoXCJidG5fQmFja1wiKTtcclxuICAgICAgICB0aGlzLl9iYWNrQnRuLnZpc2libGUgPSBmYWxzZTtcclxuICAgICAgICB0aGlzLl9iYWNrQnRuLm9uQ2xpY2sodGhpcywgdGhpcy5vbkNsaWNrQmFjayk7XHJcblxyXG4gICAgICAgIHRoaXMuX2RlbW9Db250YWluZXIgPSB0aGlzLl92aWV3LmdldENoaWxkKFwiY29udGFpbmVyXCIpLmFzQ29tO1xyXG4gICAgICAgIHRoaXMuX2NjID0gdGhpcy5fdmlldy5nZXRDb250cm9sbGVyKFwiYzFcIik7XHJcblxyXG4gICAgICAgIHZhciBjbnQ6IG51bWJlciA9IHRoaXMuX3ZpZXcubnVtQ2hpbGRyZW47XHJcbiAgICAgICAgZm9yKHZhciBpOiBudW1iZXIgPSAwO2kgPCBjbnQ7aSsrKSB7XHJcbiAgICAgICAgICAgIHZhciBvYmo6IGZhaXJ5Z3VpLkdPYmplY3QgPSB0aGlzLl92aWV3LmdldENoaWxkQXQoaSk7XHJcbiAgICAgICAgICAgIGlmKG9iai5ncm91cCAhPSBudWxsICYmIG9iai5ncm91cC5uYW1lID09IFwiYnRuc1wiKVxyXG4gICAgICAgICAgICAgICAgb2JqLm9uQ2xpY2sodGhpcywgdGhpcy5ydW5EZW1vKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHRoaXMuX2RlbW9PYmplY3RzID0ge307XHJcbiAgICB9XHJcbiAgICBcclxuICAgIHByaXZhdGUgdXBkYXRlKCk6dm9pZCB7XHJcbiAgICAgICAgdGhpcy5fdmlldy5nZXRDaGlsZChcIm4zM1wiKS5yb3RhdGlvbis9NTtcclxuICAgICAgICB0aGlzLl92aWV3LmdldENoaWxkKFwibjM0XCIpLmRpc3BsYXlPYmplY3Qucm90YXRpb24rPTU7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBydW5EZW1vKGV2dDogbGF5YS5ldmVudHMuRXZlbnQpOiB2b2lkIHtcclxuICAgICAgICB2YXIgdHlwZTogc3RyaW5nID0gZmFpcnlndWkuR09iamVjdC5jYXN0KGV2dC5jdXJyZW50VGFyZ2V0KS5uYW1lLnN1YnN0cig0KTtcclxuICAgICAgICB2YXIgb2JqOiBmYWlyeWd1aS5HQ29tcG9uZW50ID0gdGhpcy5fZGVtb09iamVjdHNbdHlwZV07XHJcbiAgICAgICAgaWYob2JqID09IG51bGwpIHtcclxuICAgICAgICAgICAgb2JqID0gZmFpcnlndWkuVUlQYWNrYWdlLmNyZWF0ZU9iamVjdChcIkJhc2ljXCIsXCJEZW1vX1wiICsgdHlwZSkuYXNDb207XHJcbiAgICAgICAgICAgIHRoaXMuX2RlbW9PYmplY3RzW3R5cGVdID0gb2JqO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgdGhpcy5fZGVtb0NvbnRhaW5lci5yZW1vdmVDaGlsZHJlbigpO1xyXG4gICAgICAgIHRoaXMuX2RlbW9Db250YWluZXIuYWRkQ2hpbGQob2JqKTtcclxuICAgICAgICB0aGlzLl9jYy5zZWxlY3RlZEluZGV4ID0gMTtcclxuICAgICAgICB0aGlzLl9iYWNrQnRuLnZpc2libGUgPSB0cnVlO1xyXG5cclxuICAgICAgICBzd2l0Y2godHlwZSkge1xyXG4gICAgICAgICAgICBjYXNlIFwiQnV0dG9uXCI6XHJcbiAgICAgICAgICAgICAgICB0aGlzLnBsYXlCdXR0b24oKTtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG5cclxuICAgICAgICAgICAgY2FzZSBcIlRleHRcIjpcclxuICAgICAgICAgICAgICAgIHRoaXMucGxheVRleHQoKTtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG5cclxuICAgICAgICAgICAgY2FzZSBcIldpbmRvd1wiOlxyXG4gICAgICAgICAgICAgICAgdGhpcy5wbGF5V2luZG93KCk7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuXHJcbiAgICAgICAgICAgIGNhc2UgXCJQb3B1cFwiOlxyXG4gICAgICAgICAgICAgICAgdGhpcy5wbGF5UG9wdXAoKTtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBjYXNlIFwiRHJhZyZEcm9wXCI6XHJcbiAgICAgICAgICAgICAgICB0aGlzLnBsYXlEcmFnRHJvcCgpO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcblxyXG4gICAgICAgICAgICBjYXNlIFwiRGVwdGhcIjpcclxuICAgICAgICAgICAgICAgIHRoaXMucGxheURlcHRoKCk7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuXHJcbiAgICAgICAgICAgIGNhc2UgXCJHcmlkXCI6XHJcbiAgICAgICAgICAgICAgICB0aGlzLnBsYXlHcmlkKCk7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBjYXNlIFwiUHJvZ3Jlc3NCYXJcIjpcclxuICAgICAgICAgICAgICAgIHRoaXMucGxheVByb2dyZXNzQmFyKCk7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBvbkNsaWNrQmFjayhldnQ6IEV2ZW50KTogdm9pZCB7XHJcbiAgICAgICAgdGhpcy5fY2Muc2VsZWN0ZWRJbmRleCA9IDA7XHJcbiAgICAgICAgdGhpcy5fYmFja0J0bi52aXNpYmxlID0gZmFsc2U7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIC8vLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcbiAgICBwcml2YXRlIHBsYXlCdXR0b24oKTogdm9pZCB7XHJcbiAgICAgICAgdmFyIG9iajogZmFpcnlndWkuR0NvbXBvbmVudCA9IHRoaXMuX2RlbW9PYmplY3RzW1wiQnV0dG9uXCJdO1xyXG4gICAgICAgIG9iai5nZXRDaGlsZChcIm4zNFwiKS5vbkNsaWNrKHRoaXMsIHRoaXMuX19jbGlja0J1dHRvbik7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIHByaXZhdGUgX19jbGlja0J1dHRvbigpOiB2b2lkIHtcclxuICAgICAgICBjb25zb2xlLmxvZyhcImNsaWNrIGJ1dHRvblwiKTsgXHJcbiAgICB9XHJcblxyXG4gICAgLy8tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuICAgIHByaXZhdGUgcGxheVRleHQoKTogdm9pZCB7XHJcbiAgICAgICAgdmFyIG9iajogZmFpcnlndWkuR0NvbXBvbmVudCA9IHRoaXMuX2RlbW9PYmplY3RzW1wiVGV4dFwiXTtcclxuICAgICAgICBvYmouZ2V0Q2hpbGQoXCJuMTJcIikub24obGF5YS5ldmVudHMuRXZlbnQuTElOSyx0aGlzLHRoaXMuX19jbGlja0xpbmspO1xyXG5cclxuICAgICAgICBvYmouZ2V0Q2hpbGQoXCJuMjJcIikub25DbGljayh0aGlzLCB0aGlzLl9fY2xpY2tHZXRJbnB1dCk7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIHByaXZhdGUgX19jbGlja0xpbmsobGluazpzdHJpbmcpOiB2b2lkIHtcclxuICAgICAgICB2YXIgb2JqOiBmYWlyeWd1aS5HQ29tcG9uZW50ID0gdGhpcy5fZGVtb09iamVjdHNbXCJUZXh0XCJdO1xyXG4gICAgICAgIG9iai5nZXRDaGlsZChcIm4xMlwiKS50ZXh0ID0gXCJbaW1nXXVpOi8vOWxlaDBleWZ0OWZqNWZbL2ltZ11bY29sb3I9I0ZGMDAwMF3kvaDngrnlh7vkuobpk77mjqVbL2NvbG9yXe+8mlwiICsgbGluaztcclxuICAgIH1cclxuICAgIFxyXG4gICAgcHJpdmF0ZSBfX2NsaWNrR2V0SW5wdXQoKTp2b2lkIHtcclxuICAgICAgICB2YXIgb2JqOiBmYWlyeWd1aS5HQ29tcG9uZW50ID0gdGhpcy5fZGVtb09iamVjdHNbXCJUZXh0XCJdO1xyXG4gICAgICAgIG9iai5nZXRDaGlsZChcIm4yMVwiKS50ZXh0ID0gb2JqLmdldENoaWxkKFwibjE5XCIpLnRleHQ7XHJcbiAgICB9XHJcbiAgICAgICAgICAgIFxyXG4gICAgLy8tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuICAgIHByaXZhdGUgX3dpbkE6IGZhaXJ5Z3VpLldpbmRvdztcclxuICAgIHByaXZhdGUgX3dpbkI6IGZhaXJ5Z3VpLldpbmRvdztcclxuICAgIHByaXZhdGUgcGxheVdpbmRvdygpOiB2b2lkIHtcclxuICAgICAgICB2YXIgb2JqOiBmYWlyeWd1aS5HQ29tcG9uZW50ID0gdGhpcy5fZGVtb09iamVjdHNbXCJXaW5kb3dcIl07XHJcbiAgICAgICAgb2JqLmdldENoaWxkKFwibjBcIikub25DbGljayh0aGlzLCB0aGlzLl9fY2xpY2tXaW5kb3dBKTtcclxuICAgICAgICBvYmouZ2V0Q2hpbGQoXCJuMVwiKS5vbkNsaWNrKHRoaXMsIHRoaXMuX19jbGlja1dpbmRvd0IpO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICBwcml2YXRlIF9fY2xpY2tXaW5kb3dBKCk6IHZvaWQge1xyXG4gICAgICAgIGlmKHRoaXMuX3dpbkEgPT0gbnVsbClcclxuICAgICAgICAgICAgdGhpcy5fd2luQSA9IG5ldyBXaW5kb3dBKCk7XHJcbiAgICAgICAgdGhpcy5fd2luQS5zaG93KCk7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIHByaXZhdGUgX19jbGlja1dpbmRvd0IoKTogdm9pZCB7XHJcbiAgICAgICAgaWYodGhpcy5fd2luQiA9PSBudWxsKVxyXG4gICAgICAgICAgICB0aGlzLl93aW5CID0gbmV3IFdpbmRvd0IoKTtcclxuICAgICAgICB0aGlzLl93aW5CLnNob3coKTtcclxuICAgIH1cclxuICAgICAgICAgICAgICAgICAgICBcclxuICAgIC8vLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcbiAgICBwcml2YXRlIF9wbTogZmFpcnlndWkuUG9wdXBNZW51O1xyXG4gICAgcHJpdmF0ZSBfcG9wdXBDb206IGZhaXJ5Z3VpLkdDb21wb25lbnQ7XHJcbiAgICBwcml2YXRlIHBsYXlQb3B1cCgpOiB2b2lkIHtcclxuICAgICAgICBpZih0aGlzLl9wbSA9PSBudWxsKSB7XHJcbiAgICAgICAgICAgIHRoaXMuX3BtID0gbmV3IGZhaXJ5Z3VpLlBvcHVwTWVudSgpO1xyXG4gICAgICAgICAgICB0aGlzLl9wbS5hZGRJdGVtKFwiSXRlbSAxXCIpO1xyXG4gICAgICAgICAgICB0aGlzLl9wbS5hZGRJdGVtKFwiSXRlbSAyXCIpO1xyXG4gICAgICAgICAgICB0aGlzLl9wbS5hZGRJdGVtKFwiSXRlbSAzXCIpO1xyXG4gICAgICAgICAgICB0aGlzLl9wbS5hZGRJdGVtKFwiSXRlbSA0XCIpO1xyXG5cclxuICAgICAgICAgICAgaWYodGhpcy5fcG9wdXBDb20gPT0gbnVsbCkge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5fcG9wdXBDb20gPSBmYWlyeWd1aS5VSVBhY2thZ2UuY3JlYXRlT2JqZWN0KFwiQmFzaWNcIixcIkNvbXBvbmVudDEyXCIpLmFzQ29tO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5fcG9wdXBDb20uY2VudGVyKCk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHZhciBvYmo6IGZhaXJ5Z3VpLkdDb21wb25lbnQgPSB0aGlzLl9kZW1vT2JqZWN0c1tcIlBvcHVwXCJdO1xyXG4gICAgICAgIHZhciBidG46IGZhaXJ5Z3VpLkdPYmplY3QgPSBvYmouZ2V0Q2hpbGQoXCJuM1wiKTtcclxuICAgICAgICBidG4ub25DbGljayh0aGlzLCB0aGlzLl9fY2xpY2tQb3B1cDEpO1xyXG5cclxuICAgICAgICB2YXIgYnRuMjogZmFpcnlndWkuR09iamVjdCA9IG9iai5nZXRDaGlsZChcIm41XCIpO1xyXG4gICAgICAgIGJ0bjIub25DbGljayh0aGlzLCB0aGlzLl9fY2xpY2tQb3B1cDIpO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICBwcml2YXRlIF9fY2xpY2tQb3B1cDEoZXZ0OmxheWEuZXZlbnRzLkV2ZW50KTp2b2lkIHtcclxuICAgICAgICB2YXIgYnRuOiBmYWlyeWd1aS5HT2JqZWN0ID0gZmFpcnlndWkuR09iamVjdC5jYXN0KGV2dC5jdXJyZW50VGFyZ2V0KTtcclxuICAgICAgICB0aGlzLl9wbS5zaG93KGJ0bix0cnVlKTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgcHJpdmF0ZSBfX2NsaWNrUG9wdXAyKCk6IHZvaWQge1xyXG4gICAgICAgIGZhaXJ5Z3VpLkdSb290Lmluc3Quc2hvd1BvcHVwKHRoaXMuX3BvcHVwQ29tKTtcclxuICAgIH1cclxuICAgICAgICAgICAgICAgICAgICBcclxuICAgIC8vLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcbiAgICBwcml2YXRlIHBsYXlEcmFnRHJvcCgpOiB2b2lkIHtcclxuICAgICAgICB2YXIgb2JqOiBmYWlyeWd1aS5HQ29tcG9uZW50ID0gdGhpcy5fZGVtb09iamVjdHNbXCJEcmFnJkRyb3BcIl07XHJcbiAgICAgICAgdmFyIGJ0bkE6IGZhaXJ5Z3VpLkdPYmplY3QgPSBvYmouZ2V0Q2hpbGQoXCJhXCIpO1xyXG4gICAgICAgIGJ0bkEuZHJhZ2dhYmxlID0gdHJ1ZTtcclxuXHJcbiAgICAgICAgdmFyIGJ0bkI6IGZhaXJ5Z3VpLkdCdXR0b24gPSBvYmouZ2V0Q2hpbGQoXCJiXCIpLmFzQnV0dG9uO1xyXG4gICAgICAgIGJ0bkIuZHJhZ2dhYmxlID0gdHJ1ZTtcclxuICAgICAgICBidG5CLm9uKGZhaXJ5Z3VpLkV2ZW50cy5EUkFHX1NUQVJULHRoaXMsdGhpcy5fX29uRHJhZ1N0YXJ0KTtcclxuXHJcbiAgICAgICAgdmFyIGJ0bkM6IGZhaXJ5Z3VpLkdCdXR0b24gPSBvYmouZ2V0Q2hpbGQoXCJjXCIpLmFzQnV0dG9uO1xyXG4gICAgICAgIGJ0bkMuaWNvbiA9IG51bGw7XHJcbiAgICAgICAgYnRuQy5vbihmYWlyeWd1aS5FdmVudHMuRFJPUCx0aGlzLHRoaXMuX19vbkRyb3ApO1xyXG5cclxuICAgICAgICB2YXIgYnRuRDogZmFpcnlndWkuR09iamVjdCA9IG9iai5nZXRDaGlsZChcImRcIik7XHJcbiAgICAgICAgYnRuRC5kcmFnZ2FibGUgPSB0cnVlO1xyXG4gICAgICAgIHZhciBib3VuZHM6IGZhaXJ5Z3VpLkdPYmplY3QgPSBvYmouZ2V0Q2hpbGQoXCJib3VuZHNcIik7XHJcbiAgICAgICAgdmFyIHJlY3Q6IGxheWEubWF0aHMuUmVjdGFuZ2xlID0gbmV3ICBsYXlhLm1hdGhzLlJlY3RhbmdsZSgpO1xyXG4gICAgICAgIGJvdW5kcy5sb2NhbFRvR2xvYmFsUmVjdCgwLDAsYm91bmRzLndpZHRoLGJvdW5kcy5oZWlnaHQscmVjdCk7XHJcbiAgICAgICAgZmFpcnlndWkuR1Jvb3QuaW5zdC5nbG9iYWxUb0xvY2FsUmVjdChyZWN0LngscmVjdC55LHJlY3Qud2lkdGgscmVjdC5oZWlnaHQscmVjdCk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgLy/lm6DkuLrov5nml7blgJnpnaLmnb/ov5jlnKjku47lj7PlvoDlt6bliqjvvIzmiYDku6VyZWN05LiN5YeG56Gu77yM6ZyA6KaB55So55u45a+55L2N572u566X5Ye65pyA57uI5YGc5LiL5p2l55qE6IyD5Zu0XHJcbiAgICAgICAgcmVjdC54IC09IG9iai5wYXJlbnQueDtcclxuXHJcbiAgICAgICAgYnRuRC5kcmFnQm91bmRzID0gcmVjdDtcclxuICAgIH1cclxuICAgIFxyXG4gICAgcHJpdmF0ZSBfX29uRHJhZ1N0YXJ0KGV2dDpsYXlhLmV2ZW50cy5FdmVudCk6dm9pZCB7XHJcbiAgICAgICAgdmFyIGJ0bjogZmFpcnlndWkuR0J1dHRvbiA9IDxmYWlyeWd1aS5HQnV0dG9uPmZhaXJ5Z3VpLkdPYmplY3QuY2FzdChldnQuY3VycmVudFRhcmdldCk7XHJcbiAgICAgICAgYnRuLnN0b3BEcmFnKCk7Ly/lj5bmtojlr7nljp/nm67moIfnmoTmi5bliqjvvIzmjaLmiJDkuIDkuKrmm7/ku6Plk4FcclxuICAgICAgICBmYWlyeWd1aS5EcmFnRHJvcE1hbmFnZXIuaW5zdC5zdGFydERyYWcoYnRuLGJ0bi5pY29uLGJ0bi5pY29uKTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgcHJpdmF0ZSBfX29uRHJvcChkYXRhOmFueSwgZXZ0OmxheWEuZXZlbnRzLkV2ZW50KTp2b2lkIHtcclxuICAgICAgICB2YXIgYnRuOiBmYWlyeWd1aS5HQnV0dG9uID0gPGZhaXJ5Z3VpLkdCdXR0b24+ZmFpcnlndWkuR09iamVjdC5jYXN0KGV2dC5jdXJyZW50VGFyZ2V0KTtcclxuICAgICAgICBidG4uaWNvbiA9IGRhdGE7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIC8vLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcbiAgICBwcml2YXRlIHBsYXlEZXB0aCgpOiB2b2lkIHtcclxuICAgICAgICB2YXIgb2JqOiBmYWlyeWd1aS5HQ29tcG9uZW50ID0gdGhpcy5fZGVtb09iamVjdHNbXCJEZXB0aFwiXTtcclxuICAgICAgICB2YXIgdGVzdENvbnRhaW5lcjogZmFpcnlndWkuR0NvbXBvbmVudCA9IG9iai5nZXRDaGlsZChcIm4yMlwiKS5hc0NvbTtcclxuICAgICAgICB2YXIgZml4ZWRPYmo6IGZhaXJ5Z3VpLkdPYmplY3QgPSB0ZXN0Q29udGFpbmVyLmdldENoaWxkKFwibjBcIik7XHJcbiAgICAgICAgZml4ZWRPYmouc29ydGluZ09yZGVyID0gMTAwO1xyXG4gICAgICAgIGZpeGVkT2JqLmRyYWdnYWJsZSA9IHRydWU7XHJcblxyXG4gICAgICAgIHZhciBudW1DaGlsZHJlbjogbnVtYmVyID0gdGVzdENvbnRhaW5lci5udW1DaGlsZHJlbjtcclxuICAgICAgICB2YXIgaTogbnVtYmVyID0gMDtcclxuICAgICAgICB3aGlsZShpIDwgbnVtQ2hpbGRyZW4pIHtcclxuICAgICAgICAgICAgdmFyIGNoaWxkOiBmYWlyeWd1aS5HT2JqZWN0ID0gdGVzdENvbnRhaW5lci5nZXRDaGlsZEF0KGkpO1xyXG4gICAgICAgICAgICBpZihjaGlsZCAhPSBmaXhlZE9iaikge1xyXG4gICAgICAgICAgICAgICAgdGVzdENvbnRhaW5lci5yZW1vdmVDaGlsZEF0KGkpO1xyXG4gICAgICAgICAgICAgICAgbnVtQ2hpbGRyZW4tLTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBlbHNlXHJcbiAgICAgICAgICAgICAgICBpKys7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHZhciBzdGFydFBvczogbGF5YS5tYXRocy5Qb2ludCA9IG5ldyBsYXlhLm1hdGhzLlBvaW50KGZpeGVkT2JqLngsZml4ZWRPYmoueSk7XHJcblxyXG4gICAgICAgIG9iai5nZXRDaGlsZChcImJ0bjBcIikub25DbGljayh0aGlzLCB0aGlzLl9fY2xpY2sxLCBbb2JqLCBzdGFydFBvc10pO1xyXG4gICAgICAgIG9iai5nZXRDaGlsZChcImJ0bjFcIikub25DbGljayh0aGlzLCB0aGlzLl9fY2xpY2syLCBbb2JqLCBzdGFydFBvc10pO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICBwcml2YXRlIF9fY2xpY2sxKG9iajpmYWlyeWd1aS5HQ29tcG9uZW50LCBzdGFydFBvczpsYXlhLm1hdGhzLlBvaW50KSB7XHJcbiAgICAgICAgdmFyIGdyYXBoOiBmYWlyeWd1aS5HR3JhcGggPSBuZXcgZmFpcnlndWkuR0dyYXBoKCk7XHJcbiAgICAgICAgc3RhcnRQb3MueCArPSAxMDtcclxuICAgICAgICBzdGFydFBvcy55ICs9IDEwO1xyXG4gICAgICAgIGdyYXBoLnNldFhZKHN0YXJ0UG9zLngsc3RhcnRQb3MueSk7XHJcbiAgICAgICAgZ3JhcGguc2V0U2l6ZSgxNTAsMTUwKTtcclxuICAgICAgICBncmFwaC5kcmF3UmVjdCgxLFwiIzAwMDAwMFwiLFwiI0ZGMDAwMFwiKTtcclxuICAgICAgICBvYmouZ2V0Q2hpbGQoXCJuMjJcIikuYXNDb20uYWRkQ2hpbGQoZ3JhcGgpO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICBwcml2YXRlIF9fY2xpY2syKG9iajpmYWlyeWd1aS5HQ29tcG9uZW50LCBzdGFydFBvczpsYXlhLm1hdGhzLlBvaW50KSB7XHJcbiAgICAgICAgdmFyIG9iajogZmFpcnlndWkuR0NvbXBvbmVudCA9IHRoaXMuX2RlbW9PYmplY3RzW1wiRGVwdGhcIl07XHJcbiAgICAgICAgdmFyIGdyYXBoOiBmYWlyeWd1aS5HR3JhcGggPSBuZXcgZmFpcnlndWkuR0dyYXBoKCk7XHJcbiAgICAgICAgc3RhcnRQb3MueCArPSAxMDtcclxuICAgICAgICBzdGFydFBvcy55ICs9IDEwO1xyXG4gICAgICAgIGdyYXBoLnNldFhZKHN0YXJ0UG9zLngsc3RhcnRQb3MueSk7XHJcbiAgICAgICAgZ3JhcGguc2V0U2l6ZSgxNTAsMTUwKTtcclxuICAgICAgICBncmFwaC5kcmF3UmVjdCgxLFwiIzAwMDAwMFwiLFwiIzAwRkYwMFwiKTtcclxuICAgICAgICBncmFwaC5zb3J0aW5nT3JkZXIgPSAyMDA7XHJcbiAgICAgICAgb2JqLmdldENoaWxkKFwibjIyXCIpLmFzQ29tLmFkZENoaWxkKGdyYXBoKTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgLy8tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuICAgIHByaXZhdGUgcGxheUdyaWQoKTogdm9pZCB7XHJcbiAgICAgICAgdmFyIG9iajogZmFpcnlndWkuR0NvbXBvbmVudCA9IHRoaXMuX2RlbW9PYmplY3RzW1wiR3JpZFwiXTtcclxuICAgICAgICB2YXIgbGlzdDE6ZmFpcnlndWkuR0xpc3QgPSBvYmouZ2V0Q2hpbGQoXCJsaXN0MVwiKS5hc0xpc3Q7XHJcbiAgICAgICAgbGlzdDEucmVtb3ZlQ2hpbGRyZW5Ub1Bvb2woKTtcclxuICAgICAgICB2YXIgdGVzdE5hbWVzOiBBcnJheTxzdHJpbmc+ID0gW1wi6Iu55p6c5omL5py65pON5L2c57O757ufXCIsXCLlronljZPmiYvmnLrmk43kvZzns7vnu59cIixcIuW+rui9r+aJi+acuuaTjeS9nOezu+e7n1wiLFwi5b6u6L2v5qGM6Z2i5pON5L2c57O757ufXCIsXCLoi7nmnpzmoYzpnaLmk43kvZzns7vnu59cIixcIuacquefpeaTjeS9nOezu+e7n1wiXTtcclxuICAgICAgICB2YXIgdGVzdENvbG9yczogQXJyYXk8bnVtYmVyPiA9IFsgMHhGRkZGMDAsMHhGRjAwMDAsMHhGRkZGRkYsMHgwMDAwRkYgXTtcclxuICAgICAgIHZhciBjbnQ6bnVtYmVyID0gdGVzdE5hbWVzLmxlbmd0aDtcclxuICAgICAgICAgZm9yKHZhciBpOm51bWJlciA9IDA7aSA8IGNudDsgaSsrKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgdmFyIGl0ZW06ZmFpcnlndWkuR0J1dHRvbiA9IGxpc3QxLmFkZEl0ZW1Gcm9tUG9vbCgpLmFzQnV0dG9uO1xyXG4gICAgICAgICAgICBpdGVtLmdldENoaWxkKFwidDBcIikudGV4dCA9IFwiXCIgKyAoaSArIDEpO1xyXG4gICAgICAgICAgICBpdGVtLmdldENoaWxkKFwidDFcIikudGV4dCA9IHRlc3ROYW1lc1tpXTtcclxuICAgICAgICAgICAgaXRlbS5nZXRDaGlsZChcInQyXCIpLmFzVGV4dEZpZWxkLmNvbG9yID0gbGF5YS51dGlscy5VdGlscy50b0hleENvbG9yKHRlc3RDb2xvcnNbTWF0aC5mbG9vcihNYXRoLnJhbmRvbSgpKjQpXSk7XHJcbiAgICAgICAgICAgIGl0ZW0uZ2V0Q2hpbGQoXCJzdGFyXCIpLmFzUHJvZ3Jlc3MudmFsdWUgPSAoTWF0aC5mbG9vcihNYXRoLnJhbmRvbSgpICogMykrMSkgLyAzICogMTAwO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgdmFyIGxpc3QyOiBmYWlyeWd1aS5HTGlzdCA9IG9iai5nZXRDaGlsZChcImxpc3QyXCIpLmFzTGlzdDtcclxuICAgICAgICBsaXN0Mi5yZW1vdmVDaGlsZHJlblRvUG9vbCgpO1xyXG4gICAgICAgIGZvcih2YXIgaTogbnVtYmVyID0gMDtpIDwgY250O2krKylcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIHZhciBpdGVtOiBmYWlyeWd1aS5HQnV0dG9uID0gbGlzdDIuYWRkSXRlbUZyb21Qb29sKCkuYXNCdXR0b247XHJcbiAgICAgICAgICAgIGl0ZW0uZ2V0Q2hpbGQoXCJjYlwiKS5hc0J1dHRvbi5zZWxlY3RlZCA9IGZhbHNlO1xyXG4gICAgICAgICAgICBpdGVtLmdldENoaWxkKFwidDFcIikudGV4dCA9IHRlc3ROYW1lc1tpXTtcclxuICAgICAgICAgICAgaXRlbS5nZXRDaGlsZChcIm1jXCIpLmFzTW92aWVDbGlwLnBsYXlpbmcgPSBpICUgMiA9PSAwO1xyXG4gICAgICAgICAgICBpdGVtLmdldENoaWxkKFwidDNcIikudGV4dCA9IFwiXCIgKyBNYXRoLmZsb29yKE1hdGgucmFuZG9tKCkgKiAxMDAwMClcclxuICAgICAgICB9XHJcbiAgICB9XHJcbiAgICBcclxuICAgIC8vLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcbiAgICBwcml2YXRlIHBsYXlQcm9ncmVzc0JhcigpOnZvaWRcclxuICAgIHtcclxuICAgICAgICB2YXIgb2JqOmZhaXJ5Z3VpLkdDb21wb25lbnQgPSB0aGlzLl9kZW1vT2JqZWN0c1tcIlByb2dyZXNzQmFyXCJdO1xyXG4gICAgICAgIExheWEudGltZXIuZnJhbWVMb29wKDIsIHRoaXMsIHRoaXMuX19wbGF5UHJvZ3Jlc3MpO1xyXG4gICAgICAgIG9iai5vbihsYXlhLmV2ZW50cy5FdmVudC5VTkRJU1BMQVksIHRoaXMsIHRoaXMuX19yZW1vdmVUaW1lcik7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIHByaXZhdGUgX19yZW1vdmVUaW1lcigpOnZvaWRcclxuICAgIHtcclxuICAgICAgICBMYXlhLnRpbWVyLmNsZWFyKHRoaXMsIHRoaXMuX19wbGF5UHJvZ3Jlc3MpO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICBwcml2YXRlIF9fcGxheVByb2dyZXNzKCk6dm9pZFxyXG4gICAge1xyXG4gICAgICAgIHZhciBvYmo6ZmFpcnlndWkuR0NvbXBvbmVudCA9IHRoaXMuX2RlbW9PYmplY3RzW1wiUHJvZ3Jlc3NCYXJcIl07XHJcbiAgICAgICAgdmFyIGNudDpudW1iZXIgPSBvYmoubnVtQ2hpbGRyZW47XHJcbiAgICAgICAgZm9yICh2YXIgaTpudW1iZXIgPSAwOyBpIDwgY250OyBpKyspXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICB2YXIgY2hpbGQ6ZmFpcnlndWkuR1Byb2dyZXNzQmFyID0gb2JqLmdldENoaWxkQXQoaSkgYXMgZmFpcnlndWkuR1Byb2dyZXNzQmFyO1xyXG4gICAgICAgICAgICBpZiAoY2hpbGQgIT0gbnVsbClcclxuICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgY2hpbGQudmFsdWUgKz0gMTtcclxuICAgICAgICAgICAgICAgIGlmIChjaGlsZC52YWx1ZSA+IGNoaWxkLm1heClcclxuICAgICAgICAgICAgICAgICAgICBjaGlsZC52YWx1ZSA9IDA7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICB9XHJcbn1cclxuIl19
