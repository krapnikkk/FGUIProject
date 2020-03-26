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

    class DatePicker extends fgui.GComponent {
        constructor() {
            super();
        }
        constructFromXML(xml) {
            super.constructFromXML(xml);
            Laya.stage.on("date_show", this, this.show);
            Laya.stage.on("date_hide", this, this.hide);
            this._btnCancel = this.getChild("n8").asButton;
            this._btnCancel.onClick(this, this.hide);
            this._btnComfirm = this.getChild("n9").asButton;
            this._btnComfirm.onClick(this, this.hide);
        }
        show() {
            this.getTransition("show").play();
        }
        hide() {
            this.getTransition("hide").play();
        }
    }

    class GameConfig {
        constructor() {
        }
        static init() {
            fgui.UIObjectFactory.setExtension("ui://ScratchCard/scratch", Scratch);
            fgui.UIObjectFactory.setExtension("ui://DatePicker/datePicker", DatePicker);
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

    class ScratchCardDemo {
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

    class EmojiParser extends fgui.UBBParser {
        constructor() {
            super();
            let tagUrls = [];
            for (let i = 0; i < EmojiParser.TAGS.length; i++) {
                const url = `./res/emoji/${EmojiParser.TAGS[i]}.png`;
                tagUrls.push(url);
            }
            Laya.loader.load(tagUrls, Laya.Handler.create(this, this.onTAGSLoaded));
        }
        onTAGSLoaded() {
            EmojiParser.TAGS.forEach(element => {
                this._handlers[":" + element] = this.onTag_Emoji;
            });
        }
        onTag_Emoji(tagName, end, attr) {
            return "<img src='./res/emoji/" + tagName.substring(1).toLowerCase() + ".png'/>";
        }
    }
    EmojiParser.TAGS = ["1f600", "1f601", "1f602", "1f603", "1f604", "1f605", "1f606", "1f607", "1f608", "1f609", "1f610", "1f611", "1f612", "1f613", "1f614", "1f615", "1f616", "1f617", "1f618", "1f619", "1f620"];

    class Message {
    }
    class ChatDemo {
        constructor() {
            fgui.UIPackage.loadPackage("res/UI/Chat", Laya.Handler.create(this, this.onUILoaded));
        }
        onUILoaded() {
            this._view = fgui.UIPackage.createObject("Chat", "Main").asCom;
            this._view.makeFullScreen();
            fgui.GRoot.inst.addChild(this._view);
            this._messages = new Array();
            this._emojiParser = new EmojiParser();
            this._list = this._view.getChild("list").asList;
            this._list.setVirtual();
            this._list.itemProvider = Laya.Handler.create(this, this.getListItemResource, null, false);
            this._list.itemRenderer = Laya.Handler.create(this, this.renderListItem, null, false);
            this._input = this._view.getChild("input1").asTextInput;
            this._input.nativeInput.on(Laya.Event.ENTER, this, this.onSubmit);
            this._view.getChild("btnSend1").onClick(this, this.onClickSendBtn);
            this._view.getChild("btnEmoji1").onClick(this, this.onClickEmojiBtn);
            this._emojiSelectUI = fgui.UIPackage.createObject("Chat", "EmojiSelectUI").asCom;
            this._emojiSelectUI.getChild("list").on(fgui.Events.CLICK_ITEM, this, this.onClickEmoji);
        }
        addMsg(sender, senderIcon, msg, fromMe) {
            let isScrollBottom = this._list.scrollPane.isBottomMost;
            let newMessage = new Message();
            newMessage.sender = sender;
            newMessage.senderIcon = senderIcon;
            newMessage.msg = msg;
            newMessage.fromMe = fromMe;
            this._messages.push(newMessage);
            if (newMessage.fromMe) {
                if (this._messages.length == 1 || Math.random() < 0.5) {
                    let replyMessage = new Message();
                    replyMessage.sender = "FairyGUI";
                    replyMessage.senderIcon = "r1";
                    replyMessage.msg = "Today is a good day. ";
                    replyMessage.fromMe = false;
                    this._messages.push(replyMessage);
                }
            }
            if (this._messages.length > 100)
                this._messages.splice(0, this._messages.length - 100);
            this._list.numItems = this._messages.length;
            if (isScrollBottom)
                this._list.scrollPane.scrollBottom();
        }
        getListItemResource(index) {
            let msg = this._messages[index];
            if (msg.fromMe)
                return "ui://Chat/chatRight";
            else
                return "ui://Chat/chatLeft";
        }
        renderListItem(index, item) {
            let msg = this._messages[index];
            if (!msg.fromMe)
                item.getChild("name").text = msg.sender;
            item.icon = fgui.UIPackage.getItemURL("Chat", msg.senderIcon);
            var txtObj = item.getChild("msg").asRichTextField;
            txtObj.width = txtObj.initWidth;
            txtObj.text = this._emojiParser.parse(msg.msg);
            if (txtObj.textWidth < txtObj.width)
                txtObj.width = txtObj.textWidth;
        }
        onClickSendBtn() {
            let msg = this._input.text;
            if (!msg)
                return;
            this.addMsg("Creator", "r0", msg, true);
            this._input.text = "";
        }
        onClickEmojiBtn(evt) {
            fgui.GRoot.inst.showPopup(this._emojiSelectUI, fgui.GObject.cast(evt.currentTarget), false);
        }
        onClickEmoji(item) {
            this._input.text += "[:" + item.text + "]";
        }
        onSubmit() {
            this.onClickSendBtn();
        }
    }

    class DatePickerDemo {
        constructor() {
            fgui.UIPackage.loadPackage("res/UI/DatePicker", Laya.Handler.create(this, this.onUILoaded));
        }
        onUILoaded() {
            this._view = fgui.UIPackage.createObject("DatePicker", "Main").asCom;
            this._view.makeFullScreen();
            fgui.GRoot.inst.addChild(this._view);
            this._btn = this._view.getChild("n1").asButton;
            this._btn.onClick(this, this.show);
        }
        show() {
            console.log("show");
            Laya.stage.event("date_show");
        }
        destroy() {
            this._btn.offClick(this, this.show);
            fgui.UIPackage.removePackage("DatePicker");
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
                this.startDemo(ScratchCardDemo);
            });
            this._view.getChild("n2").onClick(this, function () {
                this.startDemo(DatePickerDemo);
            });
            this._view.getChild("n3").onClick(this, function () {
                this.startDemo(ChatDemo);
            });
            var reg = Laya.ClassUtils.regClass;
            reg("ScratchCard", ScratchCardDemo);
            reg("ChatDemo", ChatDemo);
            reg("DatePicker", DatePickerDemo);
            let demoName = this.getQueryString("name");
            if (demoName) {
                this.startDemo(Laya.ClassUtils.getRegClass(demoName));
            }
        }
        startDemo(demoClass) {
            this._view.dispose();
            let demo = new demoClass();
            Laya.stage.event("start_demo", demo);
        }
        destroy() {
            this._view.dispose();
        }
        getQueryString(name) {
            var reg = new RegExp("(^|&)" + name + "=([^&]*)(&|$)", "i");
            var r = window.location.search.substr(1).match(reg);
            if (r != null)
                return unescape(r[2]);
            return null;
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
