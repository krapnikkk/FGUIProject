export default class MainPanel {
    private _view: fairygui.GComponent;
    private _backBtn: fairygui.GObject;
    private _demoContainer: fairygui.GComponent;
    private _cc: fairygui.Controller;

    private _demoObjects: any;

    public constructor() {
        this._view = fairygui.UIPackage.createObject("Basic", "Main").asCom;
        var scaleRatio = this._view.width/document.body.clientWidth;
        this._view.width = document.body.clientWidth;
        this._view.height = this._view.height*scaleRatio;
        this._view.setSize(fairygui.GRoot.inst.width,fairygui.GRoot.inst.height);
        fairygui.GRoot.inst.addChild(this._view);

        this._backBtn = this._view.getChild("btn_Back");
        this._backBtn.visible = false;
        this._backBtn.onClick(this, this.onClickBack);

        this._demoContainer = this._view.getChild("container").asCom;
        this._cc = this._view.getController("c1");

        var cnt: number = this._view.numChildren;
        for(var i: number = 0;i < cnt;i++) {
            var obj: fairygui.GObject = this._view.getChildAt(i);
            if(obj.group != null && obj.group.name == "btns")
                obj.onClick(this, this.runDemo);
        }

        this._demoObjects = {};
    }
    
    private update():void {
        this._view.getChild("n33").rotation+=5;
        this._view.getChild("n34").displayObject.rotation+=5;
    }

    private runDemo(evt: laya.events.Event): void {
        var type: string = fairygui.GObject.cast(evt.currentTarget).name.substr(4);
        var obj: fairygui.GComponent = this._demoObjects[type];
        if(obj == null) {
            obj = fairygui.UIPackage.createObject("Basic","Demo_" + type).asCom;
            this._demoObjects[type] = obj;
        }

        this._demoContainer.removeChildren();
        this._demoContainer.addChild(obj);
        this._cc.selectedIndex = 1;
        this._backBtn.visible = true;

        switch(type) {
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
    }

    private onClickBack(evt: Event): void {
        this._cc.selectedIndex = 0;
        this._backBtn.visible = false;
    }
    
    //------------------------------
    private playButton(): void {
        var obj: fairygui.GComponent = this._demoObjects["Button"];
        obj.getChild("n34").onClick(this, this.__clickButton);
    }
    
    private __clickButton(): void {
        console.log("click button"); 
    }

    //------------------------------
    private playText(): void {
        var obj: fairygui.GComponent = this._demoObjects["Text"];
        obj.getChild("n12").on(laya.events.Event.LINK,this,this.__clickLink);

        obj.getChild("n22").onClick(this, this.__clickGetInput);
    }
    
    private __clickLink(link:string): void {
        var obj: fairygui.GComponent = this._demoObjects["Text"];
        obj.getChild("n12").text = "[img]ui://9leh0eyft9fj5f[/img][color=#FF0000]你点击了链接[/color]：" + link;
    }
    
    private __clickGetInput():void {
        var obj: fairygui.GComponent = this._demoObjects["Text"];
        obj.getChild("n21").text = obj.getChild("n19").text;
    }
            
    //------------------------------
    private _winA: fairygui.Window;
    private _winB: fairygui.Window;
    private playWindow(): void {
        var obj: fairygui.GComponent = this._demoObjects["Window"];
        obj.getChild("n0").onClick(this, this.__clickWindowA);
        obj.getChild("n1").onClick(this, this.__clickWindowB);
    }
    
    private __clickWindowA(): void {
        if(this._winA == null)
            this._winA = new WindowA();
        this._winA.show();
    }
    
    private __clickWindowB(): void {
        if(this._winB == null)
            this._winB = new WindowB();
        this._winB.show();
    }
                    
    //------------------------------
    private _pm: fairygui.PopupMenu;
    private _popupCom: fairygui.GComponent;
    private playPopup(): void {
        if(this._pm == null) {
            this._pm = new fairygui.PopupMenu();
            this._pm.addItem("Item 1");
            this._pm.addItem("Item 2");
            this._pm.addItem("Item 3");
            this._pm.addItem("Item 4");

            if(this._popupCom == null) {
                this._popupCom = fairygui.UIPackage.createObject("Basic","Component12").asCom;
                this._popupCom.center();
            }
        }

        var obj: fairygui.GComponent = this._demoObjects["Popup"];
        var btn: fairygui.GObject = obj.getChild("n3");
        btn.onClick(this, this.__clickPopup1);

        var btn2: fairygui.GObject = obj.getChild("n5");
        btn2.onClick(this, this.__clickPopup2);
    }
    
    private __clickPopup1(evt:laya.events.Event):void {
        var btn: fairygui.GObject = fairygui.GObject.cast(evt.currentTarget);
        this._pm.show(btn,true);
    }
    
    private __clickPopup2(): void {
        fairygui.GRoot.inst.showPopup(this._popupCom);
    }
                    
    //------------------------------
    private playDragDrop(): void {
        var obj: fairygui.GComponent = this._demoObjects["Drag&Drop"];
        var btnA: fairygui.GObject = obj.getChild("a");
        btnA.draggable = true;

        var btnB: fairygui.GButton = obj.getChild("b").asButton;
        btnB.draggable = true;
        btnB.on(fairygui.Events.DRAG_START,this,this.__onDragStart);

        var btnC: fairygui.GButton = obj.getChild("c").asButton;
        btnC.icon = null;
        btnC.on(fairygui.Events.DROP,this,this.__onDrop);

        var btnD: fairygui.GObject = obj.getChild("d");
        btnD.draggable = true;
        var bounds: fairygui.GObject = obj.getChild("bounds");
        var rect: laya.maths.Rectangle = new  laya.maths.Rectangle();
        bounds.localToGlobalRect(0,0,bounds.width,bounds.height,rect);
        fairygui.GRoot.inst.globalToLocalRect(rect.x,rect.y,rect.width,rect.height,rect);
        
        //因为这时候面板还在从右往左动，所以rect不准确，需要用相对位置算出最终停下来的范围
        rect.x -= obj.parent.x;

        btnD.dragBounds = rect;
    }
    
    private __onDragStart(evt:laya.events.Event):void {
        var btn: fairygui.GButton = <fairygui.GButton>fairygui.GObject.cast(evt.currentTarget);
        btn.stopDrag();//取消对原目标的拖动，换成一个替代品
        fairygui.DragDropManager.inst.startDrag(btn,btn.icon,btn.icon);
    }
    
    private __onDrop(data:any, evt:laya.events.Event):void {
        var btn: fairygui.GButton = <fairygui.GButton>fairygui.GObject.cast(evt.currentTarget);
        btn.icon = data;
    }
    
    //------------------------------
    private playDepth(): void {
        var obj: fairygui.GComponent = this._demoObjects["Depth"];
        var testContainer: fairygui.GComponent = obj.getChild("n22").asCom;
        var fixedObj: fairygui.GObject = testContainer.getChild("n0");
        fixedObj.sortingOrder = 100;
        fixedObj.draggable = true;

        var numChildren: number = testContainer.numChildren;
        var i: number = 0;
        while(i < numChildren) {
            var child: fairygui.GObject = testContainer.getChildAt(i);
            if(child != fixedObj) {
                testContainer.removeChildAt(i);
                numChildren--;
            }
            else
                i++;
        }
        var startPos: laya.maths.Point = new laya.maths.Point(fixedObj.x,fixedObj.y);

        obj.getChild("btn0").onClick(this, this.__click1, [obj, startPos]);
        obj.getChild("btn1").onClick(this, this.__click2, [obj, startPos]);
    }
    
    private __click1(obj:fairygui.GComponent, startPos:laya.maths.Point) {
        var graph: fairygui.GGraph = new fairygui.GGraph();
        startPos.x += 10;
        startPos.y += 10;
        graph.setXY(startPos.x,startPos.y);
        graph.setSize(150,150);
        graph.drawRect(1,"#000000","#FF0000");
        obj.getChild("n22").asCom.addChild(graph);
    }
    
    private __click2(obj:fairygui.GComponent, startPos:laya.maths.Point) {
        var obj: fairygui.GComponent = this._demoObjects["Depth"];
        var graph: fairygui.GGraph = new fairygui.GGraph();
        startPos.x += 10;
        startPos.y += 10;
        graph.setXY(startPos.x,startPos.y);
        graph.setSize(150,150);
        graph.drawRect(1,"#000000","#00FF00");
        graph.sortingOrder = 200;
        obj.getChild("n22").asCom.addChild(graph);
    }
    
    //------------------------------
    private playGrid(): void {
        var obj: fairygui.GComponent = this._demoObjects["Grid"];
        var list1:fairygui.GList = obj.getChild("list1").asList;
        list1.removeChildrenToPool();
        var testNames: Array<string> = ["苹果手机操作系统","安卓手机操作系统","微软手机操作系统","微软桌面操作系统","苹果桌面操作系统","未知操作系统"];
        var testColors: Array<number> = [ 0xFFFF00,0xFF0000,0xFFFFFF,0x0000FF ];
       var cnt:number = testNames.length;
         for(var i:number = 0;i < cnt; i++)
        {
            var item:fairygui.GButton = list1.addItemFromPool().asButton;
            item.getChild("t0").text = "" + (i + 1);
            item.getChild("t1").text = testNames[i];
            item.getChild("t2").asTextField.color = laya.utils.Utils.toHexColor(testColors[Math.floor(Math.random()*4)]);
            item.getChild("star").asProgress.value = (Math.floor(Math.random() * 3)+1) / 3 * 100;
        }

        var list2: fairygui.GList = obj.getChild("list2").asList;
        list2.removeChildrenToPool();
        for(var i: number = 0;i < cnt;i++)
        {
            var item: fairygui.GButton = list2.addItemFromPool().asButton;
            item.getChild("cb").asButton.selected = false;
            item.getChild("t1").text = testNames[i];
            item.getChild("mc").asMovieClip.playing = i % 2 == 0;
            item.getChild("t3").text = "" + Math.floor(Math.random() * 10000)
        }
    }
    
    //---------------------------------------------
    private playProgressBar():void
    {
        var obj:fairygui.GComponent = this._demoObjects["ProgressBar"];
        Laya.timer.frameLoop(2, this, this.__playProgress);
        obj.on(laya.events.Event.UNDISPLAY, this, this.__removeTimer);
    }
    
    private __removeTimer():void
    {
        Laya.timer.clear(this, this.__playProgress);
    }
    
    private __playProgress():void
    {
        var obj:fairygui.GComponent = this._demoObjects["ProgressBar"];
        var cnt:number = obj.numChildren;
        for (var i:number = 0; i < cnt; i++)
        {
            var child:fairygui.GProgressBar = obj.getChildAt(i) as fairygui.GProgressBar;
            if (child != null)
            {
                child.value += 1;
                if (child.value > child.max)
                    child.value = 0;
            }
        }
    }
}
