(function () {
    'use strict';

    class DatePicker extends fgui.GComponent {
        constructor() {
            super();
            this._yearTotalCount = new Date().getFullYear();
            this._yearCount = 101;
            this._startYear = this._yearTotalCount - this._yearCount;
            this._monthTotalCount = 12;
            this._startMonth = 1;
            this._dateTotalCount = 31;
            this._startDate = 1;
            this._listRow = 4;
        }
        constructFromXML(xml) {
            super.constructFromXML(xml);
            Laya.stage.on("dataPicker_init", this, this.init);
        }
        init() {
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
            this._monthList.setVirtualAndLoop();
            this._monthList.itemRenderer = Laya.Handler.create(this, this.renderMonthListItem, null, false);
            this._monthList.numItems = this._monthTotalCount;
            this._monthList.on(fgui.Events.SCROLL, this, this.monthOnScroll);
            this._dateList = this.getChild("date_list").asList;
            this._dateList.setVirtualAndLoop();
            this._dateList.itemRenderer = Laya.Handler.create(this, this.renderDateListItem, null, false);
            this._dateList.numItems = this._dateTotalCount;
            this._dateList.on(fgui.Events.SCROLL, this, this.dateOnScroll);
            let date = new Date();
            this.setDate(date.getFullYear(), date.getMonth() + 1, date.getDate());
        }
        renderYearListItem(index, obj) {
            var item = obj;
            item.title = this._startYear + index + 1 + "年";
        }
        renderMonthListItem(index, obj) {
            var item = obj;
            item.title = this._startMonth + index + "月";
        }
        renderDateListItem(index, obj) {
            var item = obj;
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
        setDate(year, month, date) {
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
                }
                else {
                    this._dateList.numItems = 28;
                    this._dateTotalCount = 28;
                }
            }
            else if (this._currentMonth == 1 || this._currentMonth == 3 || this._currentMonth == 5 || this._currentMonth == 7 || this._currentMonth == 10 || this._currentMonth == 12) {
                this._dateList.numItems = 31;
                this._dateTotalCount = 31;
            }
            else {
                this._dateList.numItems = 30;
                this._dateTotalCount = 30;
            }
            if (this._currentDate > 0) {
                if (this._currentDate > this._dateList.numItems) {
                    this._dateList.scrollToView(this._dateTotalCount - this._listRow + 1);
                }
                else {
                    let dateIdx = this._currentDate - this._listRow >= 0 ? this._currentDate - this._listRow : this._dateTotalCount + this._currentDate - this._listRow;
                    this._dateList.scrollToView(dateIdx);
                }
                this.dateOnScroll();
            }
        }
        updateDateText() {
            Laya.stage.event("set_date", [this._currentYear, this._currentMonth, this._currentDate]);
        }
        show() {
            this.getTransition("show").play();
        }
        hide() {
            this.getTransition("hide").play();
        }
    }

    class Joystick extends fgui.GComponent {
        constructor() {
            super();
            this.touchId = -1;
            this.radius = 60;
            this._curPos = new Laya.Point();
        }
        constructFromXML(xml) {
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
        Trigger(evt) {
            this.onTouchDown(evt);
        }
        onTouchDown(evt) {
            if (this.touchId == -1) {
                this.touchId = evt.touchId;
                if (this._tweener != null) {
                    this._tweener.kill();
                    this._tweener = null;
                }
                fgui.GRoot.inst.globalToLocal(Laya.stage.mouseX, Laya.stage.mouseY, this._curPos);
                var bx = this._curPos.x - this.x;
                var by = this._curPos.y - this.y;
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
                var deltaX = bx - this._InitX;
                var deltaY = by - this._InitY;
                var degrees = Math.atan2(deltaY, deltaX) * 180 / Math.PI;
                this._thumb.rotation = degrees + 90;
                Laya.stage.on(Laya.Event.MOUSE_MOVE, this, this.OnTouchMove);
                Laya.stage.on(Laya.Event.MOUSE_UP, this, this.OnTouchUp);
            }
        }
        OnTouchUp(evt) {
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
        onTweenComplete() {
            this._tweener = null;
            this._button.selected = false;
            this._thumb.rotation = 0;
            this._center.visible = true;
            this._center.x = this._InitX - this._center.width / 2;
            this._center.y = this._InitY - this._center.height / 2;
        }
        OnTouchMove(evt) {
            if (this.touchId != -1 && evt.touchId == this.touchId) {
                var bx = Laya.stage.mouseX - this.x;
                var by = Laya.stage.mouseY - this.y;
                var moveX = bx - this._lastStageX;
                var moveY = by - this._lastStageY;
                this._lastStageX = bx;
                this._lastStageY = by;
                var buttonX = this._button.x + moveX;
                var buttonY = this._button.y + moveY;
                var offsetX = buttonX + this._button.width / 2 - this._startStageX;
                var offsetY = buttonY + this._button.height / 2 - this._startStageY;
                var rad = Math.atan2(offsetY, offsetX);
                var degree = rad * 180 / Math.PI;
                this._thumb.rotation = degree + 90;
                var maxX = this.radius * Math.cos(rad);
                var maxY = this.radius * Math.sin(rad);
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
    Joystick.JoystickMoving = "JoystickMoving";
    Joystick.JoystickUp = "JoystickUp";

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

    class GameConfig {
        constructor() {
        }
        static init() {
            fgui.UIObjectFactory.setExtension("ui://ScratchCard/scratch", Scratch);
            fgui.UIObjectFactory.setExtension("ui://DatePicker/datePicker", DatePicker);
            fgui.UIObjectFactory.setExtension("ui://MiniMap/joystick", Joystick);
        }
    }
    GameConfig.width = 1720;
    GameConfig.height = 720;
    GameConfig.scaleMode = "fixedwidth";
    GameConfig.screenMode = "none";
    GameConfig.alignV = "top";
    GameConfig.alignH = "left";
    GameConfig.startScene = "";
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
            this._dateText = this._view.getChild("n2").asTextField;
            Laya.stage.on("set_date", this, this.updateDate);
            Laya.stage.event("dataPicker_init");
        }
        show() {
            Laya.stage.event("date_show");
        }
        updateDate(year, month, day) {
            this._dateText.setVar("year", year + "").setVar("month", month + "").setVar("date", day + "").flushVars();
        }
        destroy() {
            this._btn.offClick(this, this.show);
            fgui.UIPackage.removePackage("DatePicker");
        }
    }

    class LoadFontDemo {
        constructor() {
            this.loadFont();
        }
        loadFont() {
            let fontName = "customFont";
            const customFont = new FontFace(fontName, 'url(./res/font/zkklt.ttf)');
            customFont.load().then(font => {
                document.fonts.add(font);
            }).then(() => {
                fgui.UIPackage.loadPackage("res/UI/LoadFont", Laya.Handler.create(this, this.onUILoaded));
            });
        }
        onUILoaded() {
            this._view = fgui.UIPackage.createObject("LoadFont", "Main");
            this._view.makeFullScreen();
            fgui.GRoot.inst.addChild(this._view);
            this._view.getChild("btn_compress").onClick(this, this.compress);
            this._view.getChild("btn_bmfont").onClick(this, this.bmfont);
        }
        compress() {
            window.open("https://kekee000.github.io/fonteditor/");
        }
        bmfont() {
            window.open("https://github.com/krapnikkk/TextImageGenerator");
        }
        destroy() {
            fgui.UIPackage.removePackage("LoadFont");
        }
    }

    class MiniMapDemo {
        constructor() {
            this._onPress = false;
            this.miniMapRatio = 1;
            this._roleVector = new Laya.Vector2();
            this._speed = 0.05;
            fgui.UIPackage.loadPackage("res/UI/MiniMap", Laya.Handler.create(this, this.onUILoaded));
        }
        onUILoaded() {
            this._view = fgui.UIPackage.createObject("MiniMap", "Main");
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
        createMiniMap() {
            let bg = this._view.getChild("bg");
            let { x, y, width, height } = bg;
            let htmlCanvas = bg.displayObject.drawToCanvas(width, height, x, y);
            this.bgTexture = htmlCanvas.getTexture();
            this._map.displayObject.graphics.drawTexture(this.bgTexture, 0, 0, this._map.width, this._map.height);
            this.miniMapRatio = this._map.width / width;
        }
        onTouchMove(evt) {
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
                if (this._role.x + sx >= this._bg.x && this._role.x + this._role.width + sx < this._bg.x + this._bg.width) {
                    this._role.x += sx;
                    this._mapSign.x += (sx * this.miniMapRatio);
                }
                if (this._role.y + sy >= this._bg.y && this._role.y + this._role.height + sy < this._bg.y + this._bg.height) {
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
            this._view.getChild("n4").onClick(this, function () {
                this.startDemo(LoadFontDemo);
            });
            this._view.getChild("n5").onClick(this, function () {
                this.startDemo(MiniMapDemo);
            });
            var reg = Laya.ClassUtils.regClass;
            reg("ScratchCard", ScratchCardDemo);
            reg("ChatDemo", ChatDemo);
            reg("DatePicker", DatePickerDemo);
            reg("LoadFontDemo", LoadFontDemo);
            reg("MiniMapDemo", MiniMapDemo);
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
