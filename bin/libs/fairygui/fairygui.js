window.fgui = {};
window.fairygui = window.fgui;

(function (fgui) {
    class AssetProxy {
        constructor() {
            this._asset = Laya.loader;
        }
        static get inst() {
            if (AssetProxy._inst == null)
                AssetProxy._inst = new AssetProxy();
            return AssetProxy._inst;
        }
        getRes(url) {
            return this._asset.getRes(url);
        }
        load(url, complete = null, progress = null, type = null, priority = 1, cache = true) {
            this._asset.load(url, complete, progress, type, priority, cache);
        }
        setAsset(asset) {
            this._asset = asset;
        }
    }
    fgui.AssetProxy = AssetProxy;
})(fgui || (fgui = {}));

(function (fgui) {
    class AsyncOperation {
        constructor() {
            this._itemList = new Array();
            this._objectPool = [];
        }
        createObject(pkgName, resName) {
            var pkg = fgui.UIPackage.getByName(pkgName);
            if (pkg) {
                var pi = pkg.getItemByName(resName);
                if (!pi)
                    throw new Error("resource not found: " + resName);
                this.internalCreateObject(pi);
            }
            else
                throw new Error("namespace sunnyboxs found: " + pkgName);
        }
        createObjectFromURL(url) {
            var pi = fgui.UIPackage.getItemByURL(url);
            if (pi)
                this.internalCreateObject(pi);
            else
                throw new Error("resource not found: " + url);
        }
        cancel() {
            Laya.timer.clear(this, this.run);
            this._itemList.length = 0;
            if (this._objectPool.length > 0) {
                var cnt = this._objectPool.length;
                for (var i = 0; i < cnt; i++) {
                    this._objectPool[i].dispose();
                }
                this._objectPool.length = 0;
            }
        }
        internalCreateObject(item) {
            this._itemList.length = 0;
            this._objectPool.length = 0;
            var di = new DisplayListItem(item, fgui.ObjectType.Component);
            di.childCount = this.collectComponentChildren(item);
            this._itemList.push(di);
            this._index = 0;
            Laya.timer.frameLoop(1, this, this.run);
        }
        collectComponentChildren(item) {
            var buffer = item.rawData;
            buffer.seek(0, 2);
            var di;
            var pi;
            var i;
            var dataLen;
            var curPos;
            var pkg;
            var dcnt = buffer.getInt16();
            for (i = 0; i < dcnt; i++) {
                dataLen = buffer.getInt16();
                curPos = buffer.pos;
                buffer.seek(curPos, 0);
                var type = buffer.readByte();
                var src = buffer.readS();
                var pkgId = buffer.readS();
                buffer.pos = curPos;
                if (src != null) {
                    if (pkgId != null)
                        pkg = fgui.UIPackage.getById(pkgId);
                    else
                        pkg = item.owner;
                    pi = pkg != null ? pkg.getItemById(src) : null;
                    di = new DisplayListItem(pi, type);
                    if (pi != null && pi.type == fgui.PackageItemType.Component)
                        di.childCount = this.collectComponentChildren(pi);
                }
                else {
                    di = new DisplayListItem(null, type);
                    if (type == fgui.ObjectType.List)
                        di.listItemCount = this.collectListChildren(buffer);
                }
                this._itemList.push(di);
                buffer.pos = curPos + dataLen;
            }
            return dcnt;
        }
        collectListChildren(buffer) {
            buffer.seek(buffer.pos, 8);
            var listItemCount = 0;
            var i;
            var nextPos;
            var url;
            var pi;
            var di;
            var defaultItem = buffer.readS();
            var itemCount = buffer.getInt16();
            for (i = 0; i < itemCount; i++) {
                nextPos = buffer.getInt16();
                nextPos += buffer.pos;
                url = buffer.readS();
                if (url == null)
                    url = defaultItem;
                if (url) {
                    pi = fgui.UIPackage.getItemByURL(url);
                    if (pi != null) {
                        di = new DisplayListItem(pi, pi.objectType);
                        if (pi.type == fgui.PackageItemType.Component)
                            di.childCount = this.collectComponentChildren(pi);
                        this._itemList.push(di);
                        listItemCount++;
                    }
                }
                buffer.pos = nextPos;
            }
            return listItemCount;
        }
        run() {
            var obj;
            var di;
            var poolStart;
            var k;
            var t = Laya.Browser.now();
            var frameTime = fgui.UIConfig.frameTimeForAsyncUIConstruction;
            var totalItems = this._itemList.length;
            while (this._index < totalItems) {
                di = this._itemList[this._index];
                if (di.packageItem != null) {
                    obj = fgui.UIObjectFactory.newObject(di.packageItem);
                    obj.packageItem = di.packageItem;
                    this._objectPool.push(obj);
                    fgui.UIPackage._constructing++;
                    if (di.packageItem.type == fgui.PackageItemType.Component) {
                        poolStart = this._objectPool.length - di.childCount - 1;
                        obj.constructFromResource2(this._objectPool, poolStart);
                        this._objectPool.splice(poolStart, di.childCount);
                    }
                    else {
                        obj.constructFromResource();
                    }
                    fgui.UIPackage._constructing--;
                }
                else {
                    obj = fgui.UIObjectFactory.newObject2(di.type);
                    this._objectPool.push(obj);
                    if (di.type == fgui.ObjectType.List && di.listItemCount > 0) {
                        poolStart = this._objectPool.length - di.listItemCount - 1;
                        for (k = 0; k < di.listItemCount; k++)
                            obj.itemPool.returnObject(this._objectPool[k + poolStart]);
                        this._objectPool.splice(poolStart, di.listItemCount);
                    }
                }
                this._index++;
                if ((this._index % 5 == 0) && Laya.Browser.now() - t >= frameTime)
                    return;
            }
            Laya.timer.clear(this, this.run);
            var result = this._objectPool[0];
            this._itemList.length = 0;
            this._objectPool.length = 0;
            if (this.callback != null)
                this.callback.runWith(result);
        }
    }
    fgui.AsyncOperation = AsyncOperation;
    class DisplayListItem {
        constructor(packageItem, type) {
            this.packageItem = packageItem;
            this.type = type;
        }
    }
})(fgui || (fgui = {}));

(function (fgui) {
    class Controller extends Laya.EventDispatcher {
        constructor() {
            super();
            this._selectedIndex = 0;
            this._previousIndex = 0;
            this.changing = false;
            this._pageIds = [];
            this._pageNames = [];
            this._selectedIndex = -1;
            this._previousIndex = -1;
        }
        dispose() {
            this.offAll();
        }
        get selectedIndex() {
            return this._selectedIndex;
        }
        set selectedIndex(value) {
            if (this._selectedIndex != value) {
                if (value > this._pageIds.length - 1)
                    throw "index out of bounds: " + value;
                this.changing = true;
                this._previousIndex = this._selectedIndex;
                this._selectedIndex = value;
                this.parent.applyController(this);
                this.event(fgui.Events.STATE_CHANGED, this);
                this.changing = false;
            }
        }
        setSelectedIndex(value = 0) {
            if (this._selectedIndex != value) {
                if (value > this._pageIds.length - 1)
                    throw "index out of bounds: " + value;
                this.changing = true;
                this._previousIndex = this._selectedIndex;
                this._selectedIndex = value;
                this.parent.applyController(this);
                this.changing = false;
            }
        }
        get previsousIndex() {
            return this._previousIndex;
        }
        get selectedPage() {
            if (this._selectedIndex == -1)
                return null;
            else
                return this._pageNames[this._selectedIndex];
        }
        set selectedPage(val) {
            var i = this._pageNames.indexOf(val);
            if (i == -1)
                i = 0;
            this.selectedIndex = i;
        }
        setSelectedPage(value) {
            var i = this._pageNames.indexOf(value);
            if (i == -1)
                i = 0;
            this.setSelectedIndex(i);
        }
        get previousPage() {
            if (this._previousIndex == -1)
                return null;
            else
                return this._pageNames[this._previousIndex];
        }
        get pageCount() {
            return this._pageIds.length;
        }
        getPageName(index = 0) {
            return this._pageNames[index];
        }
        addPage(name = "") {
            this.addPageAt(this.name, this._pageIds.length);
        }
        addPageAt(name, index = 0) {
            var nid = "" + (Controller._nextPageId++);
            if (index == this._pageIds.length) {
                this._pageIds.push(nid);
                this._pageNames.push(this.name);
            }
            else {
                this._pageIds.splice(index, 0, nid);
                this._pageNames.splice(index, 0, this.name);
            }
        }
        removePage(name) {
            var i = this._pageNames.indexOf(this.name);
            if (i != -1) {
                this._pageIds.splice(i, 1);
                this._pageNames.splice(i, 1);
                if (this._selectedIndex >= this._pageIds.length)
                    this.selectedIndex = this._selectedIndex - 1;
                else
                    this.parent.applyController(this);
            }
        }
        removePageAt(index = 0) {
            this._pageIds.splice(index, 1);
            this._pageNames.splice(index, 1);
            if (this._selectedIndex >= this._pageIds.length)
                this.selectedIndex = this._selectedIndex - 1;
            else
                this.parent.applyController(this);
        }
        clearPages() {
            this._pageIds.length = 0;
            this._pageNames.length = 0;
            if (this._selectedIndex != -1)
                this.selectedIndex = -1;
            else
                this.parent.applyController(this);
        }
        hasPage(aName) {
            return this._pageNames.indexOf(aName) != -1;
        }
        getPageIndexById(aId) {
            return this._pageIds.indexOf(aId);
        }
        getPageIdByName(aName) {
            var i = this._pageNames.indexOf(aName);
            if (i != -1)
                return this._pageIds[i];
            else
                return null;
        }
        getPageNameById(aId) {
            var i = this._pageIds.indexOf(aId);
            if (i != -1)
                return this._pageNames[i];
            else
                return null;
        }
        getPageId(index = 0) {
            return this._pageIds[index];
        }
        get selectedPageId() {
            if (this._selectedIndex == -1)
                return null;
            else
                return this._pageIds[this._selectedIndex];
        }
        set selectedPageId(val) {
            var i = this._pageIds.indexOf(val);
            this.selectedIndex = i;
        }
        set oppositePageId(val) {
            var i = this._pageIds.indexOf(val);
            if (i > 0)
                this.selectedIndex = 0;
            else if (this._pageIds.length > 1)
                this.selectedIndex = 1;
        }
        get previousPageId() {
            if (this._previousIndex == -1)
                return null;
            else
                return this._pageIds[this._previousIndex];
        }
        runActions() {
            if (this._actions) {
                var cnt = this._actions.length;
                for (var i = 0; i < cnt; i++) {
                    this._actions[i].run(this, this.previousPageId, this.selectedPageId);
                }
            }
        }
        setup(buffer) {
            var beginPos = buffer.pos;
            buffer.seek(beginPos, 0);
            this.name = buffer.readS();
            this.autoRadioGroupDepth = buffer.readBool();
            buffer.seek(beginPos, 1);
            var i;
            var nextPos;
            var cnt = buffer.getInt16();
            for (i = 0; i < cnt; i++) {
                this._pageIds.push(buffer.readS());
                this._pageNames.push(buffer.readS());
            }
            var homePageIndex = 0;
            if (buffer.version >= 2) {
                var homePageType = buffer.getByte();
                switch (homePageType) {
                    case 1:
                        homePageIndex = buffer.getInt16();
                        break;
                    case 2:
                        homePageIndex = this._pageNames.indexOf(fgui.UIPackage.branch);
                        if (homePageIndex == -1)
                            homePageIndex = 0;
                        break;
                    case 3:
                        homePageIndex = this._pageNames.indexOf(fgui.UIPackage.getVar(buffer.readS()));
                        if (homePageIndex == -1)
                            homePageIndex = 0;
                        break;
                }
            }
            buffer.seek(beginPos, 2);
            cnt = buffer.getInt16();
            if (cnt > 0) {
                if (this._actions == null)
                    this._actions = [];
                for (i = 0; i < cnt; i++) {
                    nextPos = buffer.getInt16();
                    nextPos += buffer.pos;
                    var action = fgui.ControllerAction.createAction(buffer.readByte());
                    action.setup(buffer);
                    this._actions.push(action);
                    buffer.pos = nextPos;
                }
            }
            if (this.parent != null && this._pageIds.length > 0)
                this._selectedIndex = homePageIndex;
            else
                this._selectedIndex = -1;
        }
    }
    Controller._nextPageId = 0;
    fgui.Controller = Controller;
})(fgui || (fgui = {}));

(function (fgui) {
    class DragDropManager {
        constructor() {
            this._agent = new fgui.GLoader();
            this._agent.draggable = true;
            this._agent.touchable = false;
            this._agent.setSize(100, 100);
            this._agent.setPivot(0.5, 0.5, true);
            this._agent.align = "center";
            this._agent.verticalAlign = "middle";
            this._agent.sortingOrder = 1000000;
            this._agent.on(fgui.Events.DRAG_END, this, this.__dragEnd);
        }
        static get inst() {
            if (DragDropManager._inst == null)
                DragDropManager._inst = new DragDropManager();
            return DragDropManager._inst;
        }
        get dragAgent() {
            return this._agent;
        }
        get dragging() {
            return this._agent.parent != null;
        }
        startDrag(source, icon, sourceData, touchPointID = -1) {
            if (this._agent.parent != null)
                return;
            this._sourceData = sourceData;
            this._agent.url = icon;
            fgui.GRoot.inst.addChild(this._agent);
            var pt = fgui.GRoot.inst.globalToLocal(Laya.stage.mouseX, Laya.stage.mouseY);
            this._agent.setXY(pt.x, pt.y);
            this._agent.startDrag(touchPointID);
        }
        cancel() {
            if (this._agent.parent != null) {
                this._agent.stopDrag();
                fgui.GRoot.inst.removeChild(this._agent);
                this._sourceData = null;
            }
        }
        __dragEnd(evt) {
            if (this._agent.parent == null)
                return;
            fgui.GRoot.inst.removeChild(this._agent);
            var sourceData = this._sourceData;
            this._sourceData = null;
            var obj = fgui.GObject.cast(evt.target);
            while (obj != null) {
                if (obj.displayObject.hasListener(fgui.Events.DROP)) {
                    obj.requestFocus();
                    obj.displayObject.event(fgui.Events.DROP, [sourceData, fgui.Events.createEvent(fgui.Events.DROP, obj.displayObject, evt)]);
                    return;
                }
                obj = obj.parent;
            }
        }
    }
    fgui.DragDropManager = DragDropManager;
})(fgui || (fgui = {}));

(function (fgui) {
    class Events {
        static createEvent(type, target, source = null) {
            Events.$event.setTo(type, target, source ? source.target : target);
            if (source) {
                Events.$event.touchId = source.touchId;
                Events.$event.nativeEvent = source.nativeEvent;
            }
            else {
                Events.$event.nativeEvent = null;
            }
            Events.$event["_stoped"] = false;
            return Events.$event;
        }
        static dispatch(type, target, source = null) {
            target.event(type, Events.createEvent(type, target, source));
        }
    }
    Events.STATE_CHANGED = "fui_state_changed";
    Events.XY_CHANGED = "fui_xy_changed";
    Events.SIZE_CHANGED = "fui_size_changed";
    Events.SIZE_DELAY_CHANGE = "fui_size_delay_change";
    Events.CLICK_ITEM = "fui_click_item";
    Events.SCROLL = "fui_scroll";
    Events.SCROLL_END = "fui_scroll_end";
    Events.DROP = "fui_drop";
    Events.FOCUS_CHANGED = "fui_focus_changed";
    Events.DRAG_START = "fui_drag_start";
    Events.DRAG_MOVE = "fui_drag_move";
    Events.DRAG_END = "fui_drag_end";
    Events.PULL_DOWN_RELEASE = "fui_pull_down_release";
    Events.PULL_UP_RELEASE = "fui_pull_up_release";
    Events.GEAR_STOP = "fui_gear_stop";
    Events.$event = new Laya.Event();
    fgui.Events = Events;
})(fgui || (fgui = {}));

(function (fgui) {
    let ButtonMode;
    (function (ButtonMode) {
        ButtonMode[ButtonMode["Common"] = 0] = "Common";
        ButtonMode[ButtonMode["Check"] = 1] = "Check";
        ButtonMode[ButtonMode["Radio"] = 2] = "Radio";
    })(ButtonMode = fgui.ButtonMode || (fgui.ButtonMode = {}));
    let AutoSizeType;
    (function (AutoSizeType) {
        AutoSizeType[AutoSizeType["None"] = 0] = "None";
        AutoSizeType[AutoSizeType["Both"] = 1] = "Both";
        AutoSizeType[AutoSizeType["Height"] = 2] = "Height";
    })(AutoSizeType = fgui.AutoSizeType || (fgui.AutoSizeType = {}));
    let AlignType;
    (function (AlignType) {
        AlignType[AlignType["Left"] = 0] = "Left";
        AlignType[AlignType["Center"] = 1] = "Center";
        AlignType[AlignType["Right"] = 2] = "Right";
    })(AlignType = fgui.AlignType || (fgui.AlignType = {}));
    let VertAlignType;
    (function (VertAlignType) {
        VertAlignType[VertAlignType["Top"] = 0] = "Top";
        VertAlignType[VertAlignType["Middle"] = 1] = "Middle";
        VertAlignType[VertAlignType["Bottom"] = 2] = "Bottom";
    })(VertAlignType = fgui.VertAlignType || (fgui.VertAlignType = {}));
    let LoaderFillType;
    (function (LoaderFillType) {
        LoaderFillType[LoaderFillType["None"] = 0] = "None";
        LoaderFillType[LoaderFillType["Scale"] = 1] = "Scale";
        LoaderFillType[LoaderFillType["ScaleMatchHeight"] = 2] = "ScaleMatchHeight";
        LoaderFillType[LoaderFillType["ScaleMatchWidth"] = 3] = "ScaleMatchWidth";
        LoaderFillType[LoaderFillType["ScaleFree"] = 4] = "ScaleFree";
        LoaderFillType[LoaderFillType["ScaleNoBorder"] = 5] = "ScaleNoBorder";
    })(LoaderFillType = fgui.LoaderFillType || (fgui.LoaderFillType = {}));
    let ListLayoutType;
    (function (ListLayoutType) {
        ListLayoutType[ListLayoutType["SingleColumn"] = 0] = "SingleColumn";
        ListLayoutType[ListLayoutType["SingleRow"] = 1] = "SingleRow";
        ListLayoutType[ListLayoutType["FlowHorizontal"] = 2] = "FlowHorizontal";
        ListLayoutType[ListLayoutType["FlowVertical"] = 3] = "FlowVertical";
        ListLayoutType[ListLayoutType["Pagination"] = 4] = "Pagination";
    })(ListLayoutType = fgui.ListLayoutType || (fgui.ListLayoutType = {}));
    let ListSelectionMode;
    (function (ListSelectionMode) {
        ListSelectionMode[ListSelectionMode["Single"] = 0] = "Single";
        ListSelectionMode[ListSelectionMode["Multiple"] = 1] = "Multiple";
        ListSelectionMode[ListSelectionMode["Multiple_SingleClick"] = 2] = "Multiple_SingleClick";
        ListSelectionMode[ListSelectionMode["None"] = 3] = "None";
    })(ListSelectionMode = fgui.ListSelectionMode || (fgui.ListSelectionMode = {}));
    let OverflowType;
    (function (OverflowType) {
        OverflowType[OverflowType["Visible"] = 0] = "Visible";
        OverflowType[OverflowType["Hidden"] = 1] = "Hidden";
        OverflowType[OverflowType["Scroll"] = 2] = "Scroll";
    })(OverflowType = fgui.OverflowType || (fgui.OverflowType = {}));
    let PackageItemType;
    (function (PackageItemType) {
        PackageItemType[PackageItemType["Image"] = 0] = "Image";
        PackageItemType[PackageItemType["MovieClip"] = 1] = "MovieClip";
        PackageItemType[PackageItemType["Sound"] = 2] = "Sound";
        PackageItemType[PackageItemType["Component"] = 3] = "Component";
        PackageItemType[PackageItemType["Atlas"] = 4] = "Atlas";
        PackageItemType[PackageItemType["Font"] = 5] = "Font";
        PackageItemType[PackageItemType["Swf"] = 6] = "Swf";
        PackageItemType[PackageItemType["Misc"] = 7] = "Misc";
        PackageItemType[PackageItemType["Unknown"] = 8] = "Unknown";
    })(PackageItemType = fgui.PackageItemType || (fgui.PackageItemType = {}));
    let ObjectType;
    (function (ObjectType) {
        ObjectType[ObjectType["Image"] = 0] = "Image";
        ObjectType[ObjectType["MovieClip"] = 1] = "MovieClip";
        ObjectType[ObjectType["Swf"] = 2] = "Swf";
        ObjectType[ObjectType["Graph"] = 3] = "Graph";
        ObjectType[ObjectType["Loader"] = 4] = "Loader";
        ObjectType[ObjectType["Group"] = 5] = "Group";
        ObjectType[ObjectType["Text"] = 6] = "Text";
        ObjectType[ObjectType["RichText"] = 7] = "RichText";
        ObjectType[ObjectType["InputText"] = 8] = "InputText";
        ObjectType[ObjectType["Component"] = 9] = "Component";
        ObjectType[ObjectType["List"] = 10] = "List";
        ObjectType[ObjectType["Label"] = 11] = "Label";
        ObjectType[ObjectType["Button"] = 12] = "Button";
        ObjectType[ObjectType["ComboBox"] = 13] = "ComboBox";
        ObjectType[ObjectType["ProgressBar"] = 14] = "ProgressBar";
        ObjectType[ObjectType["Slider"] = 15] = "Slider";
        ObjectType[ObjectType["ScrollBar"] = 16] = "ScrollBar";
        ObjectType[ObjectType["Tree"] = 17] = "Tree";
    })(ObjectType = fgui.ObjectType || (fgui.ObjectType = {}));
    let ProgressTitleType;
    (function (ProgressTitleType) {
        ProgressTitleType[ProgressTitleType["Percent"] = 0] = "Percent";
        ProgressTitleType[ProgressTitleType["ValueAndMax"] = 1] = "ValueAndMax";
        ProgressTitleType[ProgressTitleType["Value"] = 2] = "Value";
        ProgressTitleType[ProgressTitleType["Max"] = 3] = "Max";
    })(ProgressTitleType = fgui.ProgressTitleType || (fgui.ProgressTitleType = {}));
    let ScrollBarDisplayType;
    (function (ScrollBarDisplayType) {
        ScrollBarDisplayType[ScrollBarDisplayType["Default"] = 0] = "Default";
        ScrollBarDisplayType[ScrollBarDisplayType["Visible"] = 1] = "Visible";
        ScrollBarDisplayType[ScrollBarDisplayType["Auto"] = 2] = "Auto";
        ScrollBarDisplayType[ScrollBarDisplayType["Hidden"] = 3] = "Hidden";
    })(ScrollBarDisplayType = fgui.ScrollBarDisplayType || (fgui.ScrollBarDisplayType = {}));
    let ScrollType;
    (function (ScrollType) {
        ScrollType[ScrollType["Horizontal"] = 0] = "Horizontal";
        ScrollType[ScrollType["Vertical"] = 1] = "Vertical";
        ScrollType[ScrollType["Both"] = 2] = "Both";
    })(ScrollType = fgui.ScrollType || (fgui.ScrollType = {}));
    let FlipType;
    (function (FlipType) {
        FlipType[FlipType["None"] = 0] = "None";
        FlipType[FlipType["Horizontal"] = 1] = "Horizontal";
        FlipType[FlipType["Vertical"] = 2] = "Vertical";
        FlipType[FlipType["Both"] = 3] = "Both";
    })(FlipType = fgui.FlipType || (fgui.FlipType = {}));
    let ChildrenRenderOrder;
    (function (ChildrenRenderOrder) {
        ChildrenRenderOrder[ChildrenRenderOrder["Ascent"] = 0] = "Ascent";
        ChildrenRenderOrder[ChildrenRenderOrder["Descent"] = 1] = "Descent";
        ChildrenRenderOrder[ChildrenRenderOrder["Arch"] = 2] = "Arch";
    })(ChildrenRenderOrder = fgui.ChildrenRenderOrder || (fgui.ChildrenRenderOrder = {}));
    let GroupLayoutType;
    (function (GroupLayoutType) {
        GroupLayoutType[GroupLayoutType["None"] = 0] = "None";
        GroupLayoutType[GroupLayoutType["Horizontal"] = 1] = "Horizontal";
        GroupLayoutType[GroupLayoutType["Vertical"] = 2] = "Vertical";
    })(GroupLayoutType = fgui.GroupLayoutType || (fgui.GroupLayoutType = {}));
    let PopupDirection;
    (function (PopupDirection) {
        PopupDirection[PopupDirection["Auto"] = 0] = "Auto";
        PopupDirection[PopupDirection["Up"] = 1] = "Up";
        PopupDirection[PopupDirection["Down"] = 2] = "Down";
    })(PopupDirection = fgui.PopupDirection || (fgui.PopupDirection = {}));
    let RelationType;
    (function (RelationType) {
        RelationType[RelationType["Left_Left"] = 0] = "Left_Left";
        RelationType[RelationType["Left_Center"] = 1] = "Left_Center";
        RelationType[RelationType["Left_Right"] = 2] = "Left_Right";
        RelationType[RelationType["Center_Center"] = 3] = "Center_Center";
        RelationType[RelationType["Right_Left"] = 4] = "Right_Left";
        RelationType[RelationType["Right_Center"] = 5] = "Right_Center";
        RelationType[RelationType["Right_Right"] = 6] = "Right_Right";
        RelationType[RelationType["Top_Top"] = 7] = "Top_Top";
        RelationType[RelationType["Top_Middle"] = 8] = "Top_Middle";
        RelationType[RelationType["Top_Bottom"] = 9] = "Top_Bottom";
        RelationType[RelationType["Middle_Middle"] = 10] = "Middle_Middle";
        RelationType[RelationType["Bottom_Top"] = 11] = "Bottom_Top";
        RelationType[RelationType["Bottom_Middle"] = 12] = "Bottom_Middle";
        RelationType[RelationType["Bottom_Bottom"] = 13] = "Bottom_Bottom";
        RelationType[RelationType["Width"] = 14] = "Width";
        RelationType[RelationType["Height"] = 15] = "Height";
        RelationType[RelationType["LeftExt_Left"] = 16] = "LeftExt_Left";
        RelationType[RelationType["LeftExt_Right"] = 17] = "LeftExt_Right";
        RelationType[RelationType["RightExt_Left"] = 18] = "RightExt_Left";
        RelationType[RelationType["RightExt_Right"] = 19] = "RightExt_Right";
        RelationType[RelationType["TopExt_Top"] = 20] = "TopExt_Top";
        RelationType[RelationType["TopExt_Bottom"] = 21] = "TopExt_Bottom";
        RelationType[RelationType["BottomExt_Top"] = 22] = "BottomExt_Top";
        RelationType[RelationType["BottomExt_Bottom"] = 23] = "BottomExt_Bottom";
        RelationType[RelationType["Size"] = 24] = "Size";
    })(RelationType = fgui.RelationType || (fgui.RelationType = {}));
    let FillMethod;
    (function (FillMethod) {
        FillMethod[FillMethod["None"] = 0] = "None";
        FillMethod[FillMethod["Horizontal"] = 1] = "Horizontal";
        FillMethod[FillMethod["Vertical"] = 2] = "Vertical";
        FillMethod[FillMethod["Radial90"] = 3] = "Radial90";
        FillMethod[FillMethod["Radial180"] = 4] = "Radial180";
        FillMethod[FillMethod["Radial360"] = 5] = "Radial360";
    })(FillMethod = fgui.FillMethod || (fgui.FillMethod = {}));
    let FillOrigin;
    (function (FillOrigin) {
        FillOrigin[FillOrigin["Top"] = 0] = "Top";
        FillOrigin[FillOrigin["Bottom"] = 1] = "Bottom";
        FillOrigin[FillOrigin["Left"] = 2] = "Left";
        FillOrigin[FillOrigin["Right"] = 3] = "Right";
        FillOrigin[FillOrigin["TopLeft"] = 0] = "TopLeft";
        FillOrigin[FillOrigin["TopRight"] = 1] = "TopRight";
        FillOrigin[FillOrigin["BottomLeft"] = 2] = "BottomLeft";
        FillOrigin[FillOrigin["BottomRight"] = 3] = "BottomRight";
    })(FillOrigin = fgui.FillOrigin || (fgui.FillOrigin = {}));
    let FillOrigin90;
    (function (FillOrigin90) {
        FillOrigin90[FillOrigin90["TopLeft"] = 0] = "TopLeft";
        FillOrigin90[FillOrigin90["TopRight"] = 1] = "TopRight";
        FillOrigin90[FillOrigin90["BottomLeft"] = 2] = "BottomLeft";
        FillOrigin90[FillOrigin90["BottomRight"] = 3] = "BottomRight";
    })(FillOrigin90 = fgui.FillOrigin90 || (fgui.FillOrigin90 = {}));
    let ObjectPropID;
    (function (ObjectPropID) {
        ObjectPropID[ObjectPropID["Text"] = 0] = "Text";
        ObjectPropID[ObjectPropID["Icon"] = 1] = "Icon";
        ObjectPropID[ObjectPropID["Color"] = 2] = "Color";
        ObjectPropID[ObjectPropID["OutlineColor"] = 3] = "OutlineColor";
        ObjectPropID[ObjectPropID["Playing"] = 4] = "Playing";
        ObjectPropID[ObjectPropID["Frame"] = 5] = "Frame";
        ObjectPropID[ObjectPropID["DeltaTime"] = 6] = "DeltaTime";
        ObjectPropID[ObjectPropID["TimeScale"] = 7] = "TimeScale";
        ObjectPropID[ObjectPropID["FontSize"] = 8] = "FontSize";
        ObjectPropID[ObjectPropID["Selected"] = 9] = "Selected";
    })(ObjectPropID = fgui.ObjectPropID || (fgui.ObjectPropID = {}));
})(fgui || (fgui = {}));

(function (fgui) {
    class GObject {
        constructor() {
            this._x = 0;
            this._y = 0;
            this._alpha = 1;
            this._rotation = 0;
            this._visible = true;
            this._touchable = true;
            this._grayed = false;
            this._draggable = false;
            this._scaleX = 1;
            this._scaleY = 1;
            this._skewX = 0;
            this._skewY = 0;
            this._pivotX = 0;
            this._pivotY = 0;
            this._pivotAsAnchor = false;
            this._pivotOffsetX = 0;
            this._pivotOffsetY = 0;
            this._sortingOrder = 0;
            this._internalVisible = true;
            this._handlingController = false;
            this._focusable = false;
            this._pixelSnapping = false;
            this._yOffset = 0;
            this.minWidth = 0;
            this.minHeight = 0;
            this.maxWidth = 0;
            this.maxHeight = 0;
            this.sourceWidth = 0;
            this.sourceHeight = 0;
            this.initWidth = 0;
            this.initHeight = 0;
            this._width = 0;
            this._height = 0;
            this._rawWidth = 0;
            this._rawHeight = 0;
            this._sizePercentInGroup = 0;
            this._id = "" + GObject._gInstanceCounter++;
            this._name = "";
            this.createDisplayObject();
            this._relations = new fgui.Relations(this);
            this._gears = new Array(10);
        }
        get id() {
            return this._id;
        }
        get name() {
            return this._name;
        }
        set name(value) {
            this._name = value;
        }
        get x() {
            return this._x;
        }
        set x(value) {
            this.setXY(value, this._y);
        }
        get y() {
            return this._y;
        }
        set y(value) {
            this.setXY(this._x, value);
        }
        setXY(xv, yv) {
            if (this._x != xv || this._y != yv) {
                var dx = xv - this._x;
                var dy = yv - this._y;
                this._x = xv;
                this._y = yv;
                this.handleXYChanged();
                if (this instanceof fgui.GGroup)
                    (this).moveChildren(dx, dy);
                this.updateGear(1);
                if (this._parent && !(this._parent instanceof fgui.GList)) {
                    this._parent.setBoundsChangedFlag();
                    if (this._group != null)
                        this._group.setBoundsChangedFlag(true);
                    this.displayObject.event(fgui.Events.XY_CHANGED);
                }
                if (GObject.draggingObject == this && !GObject.sUpdateInDragging)
                    this.localToGlobalRect(0, 0, this.width, this.height, GObject.sGlobalRect);
            }
        }
        get xMin() {
            return this._pivotAsAnchor ? (this._x - this._width * this._pivotX) : this._x;
        }
        set xMin(value) {
            if (this._pivotAsAnchor)
                this.setXY(value + this._width * this._pivotX, this._y);
            else
                this.setXY(value, this._y);
        }
        get yMin() {
            return this._pivotAsAnchor ? (this._y - this._height * this._pivotY) : this._y;
        }
        set yMin(value) {
            if (this._pivotAsAnchor)
                this.setXY(this._x, value + this._height * this._pivotY);
            else
                this.setXY(this._x, value);
        }
        get pixelSnapping() {
            return this._pixelSnapping;
        }
        set pixelSnapping(value) {
            if (this._pixelSnapping != value) {
                this._pixelSnapping = value;
                this.handleXYChanged();
            }
        }
        center(restraint = false) {
            var r;
            if (this._parent != null)
                r = this.parent;
            else
                r = this.root;
            this.setXY((r.width - this.width) / 2, (r.height - this.height) / 2);
            if (restraint) {
                this.addRelation(r, fgui.RelationType.Center_Center);
                this.addRelation(r, fgui.RelationType.Middle_Middle);
            }
        }
        get width() {
            this.ensureSizeCorrect();
            if (this._relations.sizeDirty)
                this._relations.ensureRelationsSizeCorrect();
            return this._width;
        }
        set width(value) {
            this.setSize(value, this._rawHeight);
        }
        get height() {
            this.ensureSizeCorrect();
            if (this._relations.sizeDirty)
                this._relations.ensureRelationsSizeCorrect();
            return this._height;
        }
        set height(value) {
            this.setSize(this._rawWidth, value);
        }
        setSize(wv, hv, ignorePivot = false) {
            if (this._rawWidth != wv || this._rawHeight != hv) {
                this._rawWidth = wv;
                this._rawHeight = hv;
                if (wv < this.minWidth)
                    wv = this.minWidth;
                if (hv < this.minHeight)
                    hv = this.minHeight;
                if (this.maxWidth > 0 && wv > this.maxWidth)
                    wv = this.maxWidth;
                if (this.maxHeight > 0 && hv > this.maxHeight)
                    hv = this.maxHeight;
                var dWidth = wv - this._width;
                var dHeight = hv - this._height;
                this._width = wv;
                this._height = hv;
                this.handleSizeChanged();
                if (this._pivotX != 0 || this._pivotY != 0) {
                    if (!this._pivotAsAnchor) {
                        if (!ignorePivot)
                            this.setXY(this.x - this._pivotX * dWidth, this.y - this._pivotY * dHeight);
                        this.updatePivotOffset();
                    }
                    else
                        this.applyPivot();
                }
                if (this instanceof fgui.GGroup)
                    (this).resizeChildren(dWidth, dHeight);
                this.updateGear(2);
                if (this._parent) {
                    this._relations.onOwnerSizeChanged(dWidth, dHeight, this._pivotAsAnchor || !ignorePivot);
                    this._parent.setBoundsChangedFlag();
                    if (this._group != null)
                        this._group.setBoundsChangedFlag();
                }
                this.displayObject.event(fgui.Events.SIZE_CHANGED);
            }
        }
        ensureSizeCorrect() {
        }
        makeFullScreen() {
            this.setSize(fgui.GRoot.inst.width, fgui.GRoot.inst.height);
        }
        get actualWidth() {
            return this.width * Math.abs(this._scaleX);
        }
        get actualHeight() {
            return this.height * Math.abs(this._scaleY);
        }
        get scaleX() {
            return this._scaleX;
        }
        set scaleX(value) {
            this.setScale(value, this._scaleY);
        }
        get scaleY() {
            return this._scaleY;
        }
        set scaleY(value) {
            this.setScale(this._scaleX, value);
        }
        setScale(sx, sy) {
            if (this._scaleX != sx || this._scaleY != sy) {
                this._scaleX = sx;
                this._scaleY = sy;
                this.handleScaleChanged();
                this.applyPivot();
                this.updateGear(2);
            }
        }
        get skewX() {
            return this._skewX;
        }
        set skewX(value) {
            this.setSkew(value, this._skewY);
        }
        get skewY() {
            return this._skewY;
        }
        set skewY(value) {
            this.setSkew(this._skewX, value);
        }
        setSkew(sx, sy) {
            if (this._skewX != sx || this._skewY != sy) {
                this._skewX = sx;
                this._skewY = sy;
                if (this._displayObject != null) {
                    this._displayObject.skew(-sx, sy);
                    this.applyPivot();
                }
            }
        }
        get pivotX() {
            return this._pivotX;
        }
        set pivotX(value) {
            this.setPivot(value, this._pivotY);
        }
        get pivotY() {
            return this._pivotY;
        }
        set pivotY(value) {
            this.setPivot(this._pivotX, value);
        }
        setPivot(xv, yv = 0, asAnchor = false) {
            if (this._pivotX != xv || this._pivotY != yv || this._pivotAsAnchor != asAnchor) {
                this._pivotX = xv;
                this._pivotY = yv;
                this._pivotAsAnchor = asAnchor;
                this.updatePivotOffset();
                this.handleXYChanged();
            }
        }
        get pivotAsAnchor() {
            return this._pivotAsAnchor;
        }
        internalSetPivot(xv, yv, asAnchor) {
            this._pivotX = xv;
            this._pivotY = yv;
            this._pivotAsAnchor = asAnchor;
            if (this._pivotAsAnchor)
                this.handleXYChanged();
        }
        updatePivotOffset() {
            if (this._displayObject != null) {
                if (this._displayObject.transform && (this._pivotX != 0 || this._pivotY != 0)) {
                    GObject.sHelperPoint.x = this._pivotX * this._width;
                    GObject.sHelperPoint.y = this._pivotY * this._height;
                    var pt = this._displayObject.transform.transformPoint(GObject.sHelperPoint);
                    this._pivotOffsetX = this._pivotX * this._width - pt.x;
                    this._pivotOffsetY = this._pivotY * this._height - pt.y;
                }
                else {
                    this._pivotOffsetX = 0;
                    this._pivotOffsetY = 0;
                }
            }
        }
        applyPivot() {
            if (this._pivotX != 0 || this._pivotY != 0) {
                this.updatePivotOffset();
                this.handleXYChanged();
            }
        }
        get touchable() {
            return this._touchable;
        }
        set touchable(value) {
            if (this._touchable != value) {
                this._touchable = value;
                this.updateGear(3);
                if ((this instanceof fgui.GImage) || (this instanceof fgui.GMovieClip)
                    || (this instanceof fgui.GTextField) && !(this instanceof fgui.GTextInput) && !(this instanceof fgui.GRichTextField))
                    return;
                if (this._displayObject != null)
                    this._displayObject.mouseEnabled = this._touchable;
            }
        }
        get grayed() {
            return this._grayed;
        }
        set grayed(value) {
            if (this._grayed != value) {
                this._grayed = value;
                this.handleGrayedChanged();
                this.updateGear(3);
            }
        }
        get enabled() {
            return !this._grayed && this._touchable;
        }
        set enabled(value) {
            this.grayed = !value;
            this.touchable = value;
        }
        get rotation() {
            return this._rotation;
        }
        set rotation(value) {
            if (this._rotation != value) {
                this._rotation = value;
                if (this._displayObject != null) {
                    this._displayObject.rotation = this.normalizeRotation;
                    this.applyPivot();
                }
                this.updateGear(3);
            }
        }
        get normalizeRotation() {
            var rot = this._rotation % 360;
            if (rot > 180)
                rot = rot - 360;
            else if (rot < -180)
                rot = 360 + rot;
            return rot;
        }
        get alpha() {
            return this._alpha;
        }
        set alpha(value) {
            if (this._alpha != value) {
                this._alpha = value;
                this.handleAlphaChanged();
                this.updateGear(3);
            }
        }
        get visible() {
            return this._visible;
        }
        set visible(value) {
            if (this._visible != value) {
                this._visible = value;
                this.handleVisibleChanged();
                if (this._parent)
                    this._parent.setBoundsChangedFlag();
                if (this._group && this._group.excludeInvisibles)
                    this._group.setBoundsChangedFlag();
            }
        }
        get internalVisible() {
            return this._internalVisible && (!this._group || this._group.internalVisible)
                && !this._displayObject._cacheStyle.maskParent;
        }
        get internalVisible2() {
            return this._visible && (!this._group || this._group.internalVisible2);
        }
        get internalVisible3() {
            return this._internalVisible && this._visible;
        }
        get sortingOrder() {
            return this._sortingOrder;
        }
        set sortingOrder(value) {
            if (value < 0)
                value = 0;
            if (this._sortingOrder != value) {
                var old = this._sortingOrder;
                this._sortingOrder = value;
                if (this._parent != null)
                    this._parent.childSortingOrderChanged(this, old, this._sortingOrder);
            }
        }
        get focusable() {
            return this._focusable;
        }
        set focusable(value) {
            this._focusable = value;
        }
        get focused() {
            return this.root.focus == this;
        }
        requestFocus() {
            var p = this;
            while (p && !p._focusable)
                p = p.parent;
            if (p != null)
                this.root.focus = p;
        }
        get tooltips() {
            return this._tooltips;
        }
        set tooltips(value) {
            if (this._tooltips) {
                this.off(Laya.Event.ROLL_OVER, this, this.__rollOver);
                this.off(Laya.Event.ROLL_OUT, this, this.__rollOut);
            }
            this._tooltips = value;
            if (this._tooltips) {
                this.on(Laya.Event.ROLL_OVER, this, this.__rollOver);
                this.on(Laya.Event.ROLL_OUT, this, this.__rollOut);
            }
        }
        __rollOver(evt) {
            Laya.timer.once(100, this, this.__doShowTooltips);
        }
        __doShowTooltips() {
            var r = this.root;
            if (r)
                this.root.showTooltips(this._tooltips);
        }
        __rollOut(evt) {
            Laya.timer.clear(this, this.__doShowTooltips);
            this.root.hideTooltips();
        }
        get blendMode() {
            return this._displayObject.blendMode;
        }
        set blendMode(value) {
            this._displayObject.blendMode = value;
        }
        get filters() {
            return this._displayObject.filters;
        }
        set filters(value) {
            this._displayObject.filters = value;
        }
        get inContainer() {
            return this._displayObject != null && this._displayObject.parent != null;
        }
        get onStage() {
            return this._displayObject != null && this._displayObject.stage != null;
        }
        get resourceURL() {
            if (this.packageItem != null)
                return "ui://" + this.packageItem.owner.id + this.packageItem.id;
            else
                return null;
        }
        set group(value) {
            if (this._group != value) {
                if (this._group != null)
                    this._group.setBoundsChangedFlag();
                this._group = value;
                if (this._group != null)
                    this._group.setBoundsChangedFlag();
            }
        }
        get group() {
            return this._group;
        }
        getGear(index) {
            var gear = this._gears[index];
            if (gear == null)
                this._gears[index] = gear = fgui.GearBase.create(this, index);
            return gear;
        }
        updateGear(index) {
            if (this._underConstruct || this._gearLocked)
                return;
            var gear = this._gears[index];
            if (gear != null && gear.controller != null)
                gear.updateState();
        }
        checkGearController(index, c) {
            return this._gears[index] != null && this._gears[index].controller == c;
        }
        updateGearFromRelations(index, dx, dy) {
            if (this._gears[index] != null)
                this._gears[index].updateFromRelations(dx, dy);
        }
        addDisplayLock() {
            var gearDisplay = (this._gears[0]);
            if (gearDisplay && gearDisplay.controller) {
                var ret = gearDisplay.addLock();
                this.checkGearDisplay();
                return ret;
            }
            else
                return 0;
        }
        releaseDisplayLock(token) {
            var gearDisplay = (this._gears[0]);
            if (gearDisplay && gearDisplay.controller) {
                gearDisplay.releaseLock(token);
                this.checkGearDisplay();
            }
        }
        checkGearDisplay() {
            if (this._handlingController)
                return;
            var connected = this._gears[0] == null || (this._gears[0]).connected;
            if (this._gears[8])
                connected = this._gears[8].evaluate(connected);
            if (connected != this._internalVisible) {
                this._internalVisible = connected;
                if (this._parent) {
                    this._parent.childStateChanged(this);
                    if (this._group && this._group.excludeInvisibles)
                        this._group.setBoundsChangedFlag();
                }
            }
        }
        get relations() {
            return this._relations;
        }
        addRelation(target, relationType, usePercent = false) {
            this._relations.add(target, relationType, usePercent);
        }
        removeRelation(target, relationType = 0) {
            this._relations.remove(target, relationType);
        }
        get displayObject() {
            return this._displayObject;
        }
        get parent() {
            return this._parent;
        }
        set parent(val) {
            this._parent = val;
        }
        removeFromParent() {
            if (this._parent)
                this._parent.removeChild(this);
        }
        get root() {
            if (this instanceof fgui.GRoot)
                return (this);
            var p = this._parent;
            while (p) {
                if (p instanceof fgui.GRoot)
                    return (p);
                p = p.parent;
            }
            return fgui.GRoot.inst;
        }
        get asCom() {
            return this;
        }
        get asButton() {
            return this;
        }
        get asLabel() {
            return this;
        }
        get asProgress() {
            return this;
        }
        get asTextField() {
            return this;
        }
        get asRichTextField() {
            return this;
        }
        get asTextInput() {
            return this;
        }
        get asLoader() {
            return this;
        }
        get asList() {
            return this;
        }
        get asTree() {
            return this;
        }
        get asGraph() {
            return this;
        }
        get asGroup() {
            return this;
        }
        get asSlider() {
            return this;
        }
        get asComboBox() {
            return this;
        }
        get asImage() {
            return this;
        }
        get asMovieClip() {
            return this;
        }
        get text() {
            return null;
        }
        set text(value) {
        }
        get icon() {
            return null;
        }
        set icon(value) {
        }
        get treeNode() {
            return this._treeNode;
        }
        get isDisposed() {
            return this._displayObject == null;
        }
        dispose() {
            this.removeFromParent();
            this._relations.dispose();
            this._displayObject.destroy();
            this._displayObject = null;
            for (var i = 0; i < 10; i++) {
                var gear = this._gears[i];
                if (gear != null)
                    gear.dispose();
            }
        }
        onClick(thisObj, listener, args = null) {
            this.on(Laya.Event.CLICK, thisObj, listener, args);
        }
        offClick(thisObj, listener) {
            this.off(Laya.Event.CLICK, thisObj, listener);
        }
        hasClickListener() {
            return this._displayObject.hasListener(Laya.Event.CLICK);
        }
        on(type, thisObject, listener, args = null) {
            this._displayObject.on(type, thisObject, listener, args);
        }
        off(type, thisObject, listener) {
            this._displayObject.off(type, thisObject, listener);
        }
        get draggable() {
            return this._draggable;
        }
        set draggable(value) {
            if (this._draggable != value) {
                this._draggable = value;
                this.initDrag();
            }
        }
        get dragBounds() {
            return this._dragBounds;
        }
        set dragBounds(value) {
            this._dragBounds = value;
        }
        startDrag(touchPointID = -1) {
            if (this._displayObject.stage == null)
                return;
            this.dragBegin();
        }
        stopDrag() {
            this.dragEnd();
        }
        get dragging() {
            return GObject.draggingObject == this;
        }
        localToGlobal(ax = 0, ay = 0, resultPoint = null) {
            if (this._pivotAsAnchor) {
                ax += this._pivotX * this._width;
                ay += this._pivotY * this._height;
            }
            if (!resultPoint) {
                resultPoint = GObject.sHelperPoint;
                resultPoint.x = ax;
                resultPoint.y = ay;
                return this._displayObject.localToGlobal(resultPoint, true);
            }
            else {
                resultPoint.x = ax;
                resultPoint.y = ay;
                return this._displayObject.localToGlobal(resultPoint, false);
            }
        }
        globalToLocal(ax = 0, ay = 0, resultPoint = null) {
            if (!resultPoint) {
                resultPoint = GObject.sHelperPoint;
                resultPoint.x = ax;
                resultPoint.y = ay;
                resultPoint = this._displayObject.globalToLocal(resultPoint, true);
            }
            else {
                resultPoint.x = ax;
                resultPoint.y = ay;
                this._displayObject.globalToLocal(resultPoint, false);
            }
            if (this._pivotAsAnchor) {
                resultPoint.x -= this._pivotX * this._width;
                resultPoint.y -= this._pivotY * this._height;
            }
            return resultPoint;
        }
        localToGlobalRect(ax = 0, ay = 0, aWidth = 0, aHeight = 0, resultRect = null) {
            if (resultRect == null)
                resultRect = new Laya.Rectangle();
            var pt = this.localToGlobal(ax, ay);
            resultRect.x = pt.x;
            resultRect.y = pt.y;
            pt = this.localToGlobal(ax + aWidth, ay + aHeight);
            resultRect.width = pt.x - resultRect.x;
            resultRect.height = pt.y - resultRect.y;
            return resultRect;
        }
        globalToLocalRect(ax = 0, ay = 0, aWidth = 0, aHeight = 0, resultRect = null) {
            if (resultRect == null)
                resultRect = new Laya.Rectangle();
            var pt = this.globalToLocal(ax, ay);
            resultRect.x = pt.x;
            resultRect.y = pt.y;
            pt = this.globalToLocal(ax + aWidth, ay + aHeight);
            resultRect.width = pt.x - resultRect.x;
            resultRect.height = pt.y - resultRect.y;
            return resultRect;
        }
        handleControllerChanged(c) {
            this._handlingController = true;
            for (var i = 0; i < 10; i++) {
                var gear = this._gears[i];
                if (gear != null && gear.controller == c)
                    gear.apply();
            }
            this._handlingController = false;
            this.checkGearDisplay();
        }
        createDisplayObject() {
            this._displayObject = new Laya.Sprite();
            this._displayObject["$owner"] = this;
        }
        handleXYChanged() {
            var xv = this._x;
            var yv = this._y + this._yOffset;
            if (this._pivotAsAnchor) {
                xv -= this._pivotX * this._width;
                yv -= this._pivotY * this._height;
            }
            if (this._pixelSnapping) {
                xv = Math.round(xv);
                yv = Math.round(yv);
            }
            this._displayObject.pos(xv + this._pivotOffsetX, yv + this._pivotOffsetY);
        }
        handleSizeChanged() {
            this._displayObject.size(this._width, this._height);
        }
        handleScaleChanged() {
            this._displayObject.scale(this._scaleX, this._scaleY, true);
        }
        handleGrayedChanged() {
            fgui.ToolSet.setColorFilter(this._displayObject, this._grayed);
        }
        handleAlphaChanged() {
            this._displayObject.alpha = this._alpha;
        }
        handleVisibleChanged() {
            this._displayObject.visible = this.internalVisible2;
        }
        getProp(index) {
            switch (index) {
                case fgui.ObjectPropID.Text:
                    return this.text;
                case fgui.ObjectPropID.Icon:
                    return this.icon;
                case fgui.ObjectPropID.Color:
                    return null;
                case fgui.ObjectPropID.OutlineColor:
                    return null;
                case fgui.ObjectPropID.Playing:
                    return false;
                case fgui.ObjectPropID.Frame:
                    return 0;
                case fgui.ObjectPropID.DeltaTime:
                    return 0;
                case fgui.ObjectPropID.TimeScale:
                    return 1;
                case fgui.ObjectPropID.FontSize:
                    return 0;
                case fgui.ObjectPropID.Selected:
                    return false;
                default:
                    return undefined;
            }
        }
        setProp(index, value) {
            switch (index) {
                case fgui.ObjectPropID.Text:
                    this.text = value;
                    break;
                case fgui.ObjectPropID.Icon:
                    this.icon = value;
                    break;
            }
        }
        constructFromResource() {
        }
        setup_beforeAdd(buffer, beginPos) {
            buffer.seek(beginPos, 0);
            buffer.skip(5);
            var f1;
            var f2;
            this._id = buffer.readS();
            this._name = buffer.readS();
            f1 = buffer.getInt32();
            f2 = buffer.getInt32();
            this.setXY(f1, f2);
            if (buffer.readBool()) {
                this.initWidth = buffer.getInt32();
                this.initHeight = buffer.getInt32();
                this.setSize(this.initWidth, this.initHeight, true);
            }
            if (buffer.readBool()) {
                this.minWidth = buffer.getInt32();
                this.maxWidth = buffer.getInt32();
                this.minHeight = buffer.getInt32();
                this.maxHeight = buffer.getInt32();
            }
            if (buffer.readBool()) {
                f1 = buffer.getFloat32();
                f2 = buffer.getFloat32();
                this.setScale(f1, f2);
            }
            if (buffer.readBool()) {
                f1 = buffer.getFloat32();
                f2 = buffer.getFloat32();
                this.setSkew(f1, f2);
            }
            if (buffer.readBool()) {
                f1 = buffer.getFloat32();
                f2 = buffer.getFloat32();
                this.setPivot(f1, f2, buffer.readBool());
            }
            f1 = buffer.getFloat32();
            if (f1 != 1)
                this.alpha = f1;
            f1 = buffer.getFloat32();
            if (f1 != 0)
                this.rotation = f1;
            if (!buffer.readBool())
                this.visible = false;
            if (!buffer.readBool())
                this.touchable = false;
            if (buffer.readBool())
                this.grayed = true;
            var bm = buffer.readByte();
            if (bm == 2)
                this.blendMode = "lighter";
            var filter = buffer.readByte();
            if (filter == 1) {
                fgui.ToolSet.setColorFilter(this._displayObject, [buffer.getFloat32(), buffer.getFloat32(), buffer.getFloat32(), buffer.getFloat32()]);
            }
            var str = buffer.readS();
            if (str != null)
                this.data = str;
        }
        setup_afterAdd(buffer, beginPos) {
            buffer.seek(beginPos, 1);
            var str = buffer.readS();
            if (str != null)
                this.tooltips = str;
            var groupId = buffer.getInt16();
            if (groupId >= 0)
                this.group = this.parent.getChildAt(groupId);
            buffer.seek(beginPos, 2);
            var cnt = buffer.getInt16();
            for (var i = 0; i < cnt; i++) {
                var nextPos = buffer.getInt16();
                nextPos += buffer.pos;
                var gear = this.getGear(buffer.readByte());
                gear.setup(buffer);
                buffer.pos = nextPos;
            }
        }
        initDrag() {
            if (this._draggable)
                this.on(Laya.Event.MOUSE_DOWN, this, this.__begin);
            else
                this.off(Laya.Event.MOUSE_DOWN, this, this.__begin);
        }
        dragBegin() {
            if (GObject.draggingObject != null)
                GObject.draggingObject.stopDrag();
            GObject.sGlobalDragStart.x = Laya.stage.mouseX;
            GObject.sGlobalDragStart.y = Laya.stage.mouseY;
            this.localToGlobalRect(0, 0, this.width, this.height, GObject.sGlobalRect);
            GObject.draggingObject = this;
            Laya.stage.on(Laya.Event.MOUSE_MOVE, this, this.__moving2);
            Laya.stage.on(Laya.Event.MOUSE_UP, this, this.__end2);
        }
        dragEnd() {
            if (GObject.draggingObject == this) {
                Laya.stage.off(Laya.Event.MOUSE_MOVE, this, this.__moving2);
                Laya.stage.off(Laya.Event.MOUSE_UP, this, this.__end2);
                GObject.draggingObject = null;
            }
            GObject.sDraggingQuery = false;
        }
        reset() {
            Laya.stage.off(Laya.Event.MOUSE_MOVE, this, this.__moving);
            Laya.stage.off(Laya.Event.MOUSE_UP, this, this.__end);
        }
        __begin() {
            if (this._touchDownPoint == null)
                this._touchDownPoint = new Laya.Point();
            this._touchDownPoint.x = Laya.stage.mouseX;
            this._touchDownPoint.y = Laya.stage.mouseY;
            Laya.stage.on(Laya.Event.MOUSE_MOVE, this, this.__moving);
            Laya.stage.on(Laya.Event.MOUSE_UP, this, this.__end);
        }
        __end() {
            this.reset();
        }
        __moving(evt) {
            var sensitivity = fgui.UIConfig.touchDragSensitivity;
            if (this._touchDownPoint != null
                && Math.abs(this._touchDownPoint.x - Laya.stage.mouseX) < sensitivity
                && Math.abs(this._touchDownPoint.y - Laya.stage.mouseY) < sensitivity)
                return;
            this.reset();
            GObject.sDraggingQuery = true;
            fgui.Events.dispatch(fgui.Events.DRAG_START, this._displayObject, evt);
            if (GObject.sDraggingQuery)
                this.dragBegin();
        }
        __moving2(evt) {
            var xx = Laya.stage.mouseX - GObject.sGlobalDragStart.x + GObject.sGlobalRect.x;
            var yy = Laya.stage.mouseY - GObject.sGlobalDragStart.y + GObject.sGlobalRect.y;
            if (this._dragBounds != null) {
                var rect = fgui.GRoot.inst.localToGlobalRect(this._dragBounds.x, this._dragBounds.y, this._dragBounds.width, this._dragBounds.height, GObject.sDragHelperRect);
                if (xx < rect.x)
                    xx = rect.x;
                else if (xx + GObject.sGlobalRect.width > rect.right) {
                    xx = rect.right - GObject.sGlobalRect.width;
                    if (xx < rect.x)
                        xx = rect.x;
                }
                if (yy < rect.y)
                    yy = rect.y;
                else if (yy + GObject.sGlobalRect.height > rect.bottom) {
                    yy = rect.bottom - GObject.sGlobalRect.height;
                    if (yy < rect.y)
                        yy = rect.y;
                }
            }
            GObject.sUpdateInDragging = true;
            var pt = this.parent.globalToLocal(xx, yy, GObject.sHelperPoint);
            this.setXY(Math.round(pt.x), Math.round(pt.y));
            GObject.sUpdateInDragging = false;
            fgui.Events.dispatch(fgui.Events.DRAG_MOVE, this._displayObject, evt);
        }
        __end2(evt) {
            if (GObject.draggingObject == this) {
                this.stopDrag();
                fgui.Events.dispatch(fgui.Events.DRAG_END, this._displayObject, evt);
            }
        }
        static cast(sprite) {
            return (sprite["$owner"]);
        }
    }
    GObject._gInstanceCounter = 0;
    GObject.sGlobalDragStart = new Laya.Point();
    GObject.sGlobalRect = new Laya.Rectangle();
    GObject.sHelperPoint = new Laya.Point();
    GObject.sDragHelperRect = new Laya.Rectangle();
    fgui.GObject = GObject;
})(fgui || (fgui = {}));

(function (fgui) {
    class GTextField extends fgui.GObject {
        constructor() {
            super();
            this._gearColor = new fgui.GearColor(this);
        }
        get font() {
            return null;
        }
        set font(value) {
        }
        get fontSize() {
            return 0;
        }
        set fontSize(value) {
        }
        get color() {
            return null;
        }
        set color(value) {
        }
        get align() {
            return null;
        }
        set align(value) {
        }
        get valign() {
            return null;
        }
        set valign(value) {
        }
        get leading() {
            return 0;
        }
        set leading(value) {
        }
        get letterSpacing() {
            return 0;
        }
        set letterSpacing(value) {
        }
        get bold() {
            return false;
        }
        set bold(value) {
        }
        get italic() {
            return false;
        }
        set italic(value) {
        }
        get underline() {
            return false;
        }
        set underline(value) {
        }
        get singleLine() {
            return false;
        }
        set singleLine(value) {
        }
        get stroke() {
            return 0;
        }
        set stroke(value) {
        }
        get strokeColor() {
            return null;
        }
        set strokeColor(value) {
        }
        set ubbEnabled(value) {
            this._ubbEnabled = value;
        }
        get ubbEnabled() {
            return this._ubbEnabled;
        }
        get autoSize() {
            return this._autoSize;
        }
        set autoSize(value) {
            if (this._autoSize != value) {
                this._autoSize = value;
                this._widthAutoSize = this._autoSize == fgui.AutoSizeType.Both;
                this._heightAutoSize = this._autoSize == fgui.AutoSizeType.Both || this._autoSize == fgui.AutoSizeType.Height;
                this.updateAutoSize();
            }
        }
        updateAutoSize() {
        }
        get textWidth() {
            return 0;
        }
        parseTemplate(template) {
            var pos1 = 0, pos2, pos3;
            var tag;
            var value;
            var result = "";
            while ((pos2 = template.indexOf("{", pos1)) != -1) {
                if (pos2 > 0 && template.charCodeAt(pos2 - 1) == 92) {
                    result += template.substring(pos1, pos2 - 1);
                    result += "{";
                    pos1 = pos2 + 1;
                    continue;
                }
                result += template.substring(pos1, pos2);
                pos1 = pos2;
                pos2 = template.indexOf("}", pos1);
                if (pos2 == -1)
                    break;
                if (pos2 == pos1 + 1) {
                    result += template.substr(pos1, 2);
                    pos1 = pos2 + 1;
                    continue;
                }
                tag = template.substring(pos1 + 1, pos2);
                pos3 = tag.indexOf("=");
                if (pos3 != -1) {
                    value = this._templateVars[tag.substring(0, pos3)];
                    if (value == null)
                        result += tag.substring(pos3 + 1);
                    else
                        result += value;
                }
                else {
                    value = this._templateVars[tag];
                    if (value != null)
                        result += value;
                }
                pos1 = pos2 + 1;
            }
            if (pos1 < template.length)
                result += template.substr(pos1);
            return result;
        }
        get templateVars() {
            return this._templateVars;
        }
        set templateVars(value) {
            if (this._templateVars == null && value == null)
                return;
            this._templateVars = value;
            this.flushVars();
        }
        setVar(name, value) {
            if (!this._templateVars)
                this._templateVars = {};
            this._templateVars[name] = value;
            return this;
        }
        flushVars() {
            this.text = this._text;
        }
        handleControllerChanged(c) {
            super.handleControllerChanged(c);
            if (this._gearColor.controller == c)
                this._gearColor.apply();
        }
        getProp(index) {
            switch (index) {
                case fgui.ObjectPropID.Color:
                    return this.color;
                case fgui.ObjectPropID.OutlineColor:
                    return this.strokeColor;
                case fgui.ObjectPropID.FontSize:
                    return this.fontSize;
                default:
                    return super.getProp(index);
            }
        }
        setProp(index, value) {
            switch (index) {
                case fgui.ObjectPropID.Color:
                    this.color = value;
                    break;
                case fgui.ObjectPropID.OutlineColor:
                    this.strokeColor = value;
                    break;
                case fgui.ObjectPropID.FontSize:
                    this.fontSize = value;
                    break;
                default:
                    super.setProp(index, value);
                    break;
            }
        }
        setup_beforeAdd(buffer, beginPos) {
            super.setup_beforeAdd(buffer, beginPos);
            buffer.seek(beginPos, 5);
            var iv;
            this.font = buffer.readS();
            this.fontSize = buffer.getInt16();
            this.color = buffer.readColorS();
            iv = buffer.readByte();
            this.align = iv == 0 ? "left" : (iv == 1 ? "center" : "right");
            iv = buffer.readByte();
            this.valign = iv == 0 ? "top" : (iv == 1 ? "middle" : "bottom");
            this.leading = buffer.getInt16();
            this.letterSpacing = buffer.getInt16();
            this.ubbEnabled = buffer.readBool();
            this.autoSize = buffer.readByte();
            this.underline = buffer.readBool();
            this.italic = buffer.readBool();
            this.bold = buffer.readBool();
            this.singleLine = buffer.readBool();
            if (buffer.readBool()) {
                this.strokeColor = buffer.readColorS();
                this.stroke = buffer.getFloat32() + 1;
            }
            if (buffer.readBool())
                buffer.skip(12);
            if (buffer.readBool())
                this._templateVars = {};
        }
        setup_afterAdd(buffer, beginPos) {
            super.setup_afterAdd(buffer, beginPos);
            buffer.seek(beginPos, 6);
            var str = buffer.readS();
            if (str != null)
                this.text = str;
        }
    }
    fgui.GTextField = GTextField;
})(fgui || (fgui = {}));

(function (fgui) {
    class GBasicTextField extends fgui.GTextField {
        constructor() {
            super();
            this._letterSpacing = 0;
            this._textWidth = 0;
            this._textHeight = 0;
            this._text = "";
            this._color = "#000000";
            this._textField.align = "left";
            this._textField.font = fgui.UIConfig.defaultFont;
            this._autoSize = fgui.AutoSizeType.Both;
            this._widthAutoSize = this._heightAutoSize = true;
            this._textField["_sizeDirty"] = false;
        }
        createDisplayObject() {
            this._displayObject = this._textField = new TextExt(this);
            this._displayObject["$owner"] = this;
            this._displayObject.mouseEnabled = false;
        }
        get nativeText() {
            return this._textField;
        }
        set text(value) {
            this._text = value;
            if (this._text == null)
                this._text = "";
            if (this._bitmapFont == null) {
                if (this._widthAutoSize)
                    this._textField.width = 10000;
                var text2 = this._text;
                if (this._templateVars != null)
                    text2 = this.parseTemplate(text2);
                if (this._ubbEnabled)
                    this._textField.text = fgui.ToolSet.removeUBB(fgui.ToolSet.encodeHTML(text2));
                else
                    this._textField.text = text2;
            }
            else {
                this._textField.text = "";
                this._textField["setChanged"]();
            }
            if (this.parent && this.parent._underConstruct)
                this._textField.typeset();
        }
        get text() {
            return this._text;
        }
        get font() {
            return this._textField.font;
        }
        set font(value) {
            this._font = value;
            if (fgui.ToolSet.startsWith(this._font, "ui://"))
                this._bitmapFont = fgui.UIPackage.getItemAssetByURL(this._font);
            else
                this._bitmapFont = null;
            if (this._bitmapFont != null) {
                this._textField["setChanged"]();
            }
            else {
                if (this._font)
                    this._textField.font = this._font;
                else
                    this._textField.font = fgui.UIConfig.defaultFont;
            }
        }
        get fontSize() {
            return this._textField.fontSize;
        }
        set fontSize(value) {
            this._textField.fontSize = value;
        }
        get color() {
            return this._color;
        }
        set color(value) {
            if (this._color != value) {
                this._color = value;
                if (this._gearColor.controller)
                    this._gearColor.updateState();
                if (this.grayed)
                    this._textField.color = "#AAAAAA";
                else
                    this._textField.color = this._color;
            }
        }
        get align() {
            return this._textField.align;
        }
        set align(value) {
            this._textField.align = value;
        }
        get valign() {
            return this._textField.valign;
        }
        set valign(value) {
            this._textField.valign = value;
        }
        get leading() {
            return this._textField.leading;
        }
        set leading(value) {
            this._textField.leading = value;
        }
        get letterSpacing() {
            return this._letterSpacing;
        }
        set letterSpacing(value) {
            this._letterSpacing = value;
        }
        get bold() {
            return this._textField.bold;
        }
        set bold(value) {
            this._textField.bold = value;
        }
        get italic() {
            return this._textField.italic;
        }
        set italic(value) {
            this._textField.italic = value;
        }
        get underline() {
            return this._textField.underline;
        }
        set underline(value) {
            this._textField.underline = value;
        }
        get singleLine() {
            return this._singleLine;
        }
        set singleLine(value) {
            this._singleLine = value;
            this._textField.wordWrap = !this._widthAutoSize && !this._singleLine;
        }
        get stroke() {
            return this._textField.stroke;
        }
        set stroke(value) {
            this._textField.stroke = value;
        }
        get strokeColor() {
            return this._textField.strokeColor;
        }
        set strokeColor(value) {
            this._textField.strokeColor = value;
            this.updateGear(4);
        }
        updateAutoSize() {
            this._textField.wordWrap = !this._widthAutoSize && !this._singleLine;
            if (!this._underConstruct) {
                if (!this._heightAutoSize)
                    this._textField.size(this.width, this.height);
                else if (!this._widthAutoSize)
                    this._textField.width = this.width;
            }
        }
        get textWidth() {
            if (this._textField["_isChanged"])
                this._textField.typeset();
            return this._textWidth;
        }
        ensureSizeCorrect() {
            if (!this._underConstruct && this._textField["_isChanged"])
                this._textField.typeset();
        }
        typeset() {
            if (this._bitmapFont != null)
                this.renderWithBitmapFont();
            else if (this._widthAutoSize || this._heightAutoSize)
                this.updateSize();
        }
        updateSize() {
            this._textWidth = Math.ceil(this._textField.textWidth);
            this._textHeight = Math.ceil(this._textField.textHeight);
            var w, h = 0;
            if (this._widthAutoSize) {
                w = this._textWidth;
                if (this._textField.width != w) {
                    this._textField.width = w;
                    if (this._textField.align != "left")
                        this._textField["baseTypeset"]();
                }
            }
            else
                w = this.width;
            if (this._heightAutoSize) {
                h = this._textHeight;
                if (!this._widthAutoSize) {
                    if (this._textField.height != this._textHeight)
                        this._textField.height = this._textHeight;
                }
            }
            else {
                h = this.height;
                if (this._textHeight > h)
                    this._textHeight = h;
                if (this._textField.height != this._textHeight)
                    this._textField.height = this._textHeight;
            }
            this._updatingSize = true;
            this.setSize(w, h);
            this._updatingSize = false;
        }
        renderWithBitmapFont() {
            var gr = this._displayObject.graphics;
            gr.clear();
            if (!this._lines)
                this._lines = new Array();
            else
                LineInfo.returnList(this._lines);
            var lineSpacing = this.leading - 1;
            var rectWidth = this.width - GBasicTextField.GUTTER_X * 2;
            var lineWidth = 0, lineHeight = 0, lineTextHeight = 0;
            var glyphWidth = 0, glyphHeight = 0;
            var wordChars = 0, wordStart = 0, wordEnd = 0;
            var lastLineHeight = 0;
            var lineBuffer = "";
            var lineY = GBasicTextField.GUTTER_Y;
            var line;
            var wordWrap = !this._widthAutoSize && !this._singleLine;
            var fontSize = this.fontSize;
            var fontScale = this._bitmapFont.resizable ? fontSize / this._bitmapFont.size : 1;
            this._textWidth = 0;
            this._textHeight = 0;
            var text2 = this._text;
            if (this._templateVars != null)
                text2 = this.parseTemplate(text2);
            var textLength = text2.length;
            for (var offset = 0; offset < textLength; ++offset) {
                var ch = text2.charAt(offset);
                var cc = ch.charCodeAt(0);
                if (cc == 10) {
                    lineBuffer += ch;
                    line = LineInfo.borrow();
                    line.width = lineWidth;
                    if (lineTextHeight == 0) {
                        if (lastLineHeight == 0)
                            lastLineHeight = fontSize;
                        if (lineHeight == 0)
                            lineHeight = lastLineHeight;
                        lineTextHeight = lineHeight;
                    }
                    line.height = lineHeight;
                    lastLineHeight = lineHeight;
                    line.textHeight = lineTextHeight;
                    line.text = lineBuffer;
                    line.y = lineY;
                    lineY += (line.height + lineSpacing);
                    if (line.width > this._textWidth)
                        this._textWidth = line.width;
                    this._lines.push(line);
                    lineBuffer = "";
                    lineWidth = 0;
                    lineHeight = 0;
                    lineTextHeight = 0;
                    wordChars = 0;
                    wordStart = 0;
                    wordEnd = 0;
                    continue;
                }
                if (cc >= 65 && cc <= 90 || cc >= 97 && cc <= 122) {
                    if (wordChars == 0)
                        wordStart = lineWidth;
                    wordChars++;
                }
                else {
                    if (wordChars > 0)
                        wordEnd = lineWidth;
                    wordChars = 0;
                }
                if (cc == 32) {
                    glyphWidth = Math.ceil(fontSize / 2);
                    glyphHeight = fontSize;
                }
                else {
                    var glyph = this._bitmapFont.glyphs[ch];
                    if (glyph) {
                        glyphWidth = Math.ceil(glyph.advance * fontScale);
                        glyphHeight = Math.ceil(glyph.lineHeight * fontScale);
                    }
                    else {
                        glyphWidth = 0;
                        glyphHeight = 0;
                    }
                }
                if (glyphHeight > lineTextHeight)
                    lineTextHeight = glyphHeight;
                if (glyphHeight > lineHeight)
                    lineHeight = glyphHeight;
                if (lineWidth != 0)
                    lineWidth += this._letterSpacing;
                lineWidth += glyphWidth;
                if (!wordWrap || lineWidth <= rectWidth) {
                    lineBuffer += ch;
                }
                else {
                    line = LineInfo.borrow();
                    line.height = lineHeight;
                    line.textHeight = lineTextHeight;
                    if (lineBuffer.length == 0) {
                        line.text = ch;
                    }
                    else if (wordChars > 0 && wordEnd > 0) {
                        lineBuffer += ch;
                        var len = lineBuffer.length - wordChars;
                        line.text = fgui.ToolSet.trimRight(lineBuffer.substr(0, len));
                        line.width = wordEnd;
                        lineBuffer = lineBuffer.substr(len);
                        lineWidth -= wordStart;
                    }
                    else {
                        line.text = lineBuffer;
                        line.width = lineWidth - (glyphWidth + this._letterSpacing);
                        lineBuffer = ch;
                        lineWidth = glyphWidth;
                        lineHeight = glyphHeight;
                        lineTextHeight = glyphHeight;
                    }
                    line.y = lineY;
                    lineY += (line.height + lineSpacing);
                    if (line.width > this._textWidth)
                        this._textWidth = line.width;
                    wordChars = 0;
                    wordStart = 0;
                    wordEnd = 0;
                    this._lines.push(line);
                }
            }
            if (lineBuffer.length > 0) {
                line = LineInfo.borrow();
                line.width = lineWidth;
                if (lineHeight == 0)
                    lineHeight = lastLineHeight;
                if (lineTextHeight == 0)
                    lineTextHeight = lineHeight;
                line.height = lineHeight;
                line.textHeight = lineTextHeight;
                line.text = lineBuffer;
                line.y = lineY;
                if (line.width > this._textWidth)
                    this._textWidth = line.width;
                this._lines.push(line);
            }
            if (this._textWidth > 0)
                this._textWidth += GBasicTextField.GUTTER_X * 2;
            var count = this._lines.length;
            if (count == 0) {
                this._textHeight = 0;
            }
            else {
                line = this._lines[this._lines.length - 1];
                this._textHeight = line.y + line.height + GBasicTextField.GUTTER_Y;
            }
            var w, h = 0;
            if (this._widthAutoSize) {
                if (this._textWidth == 0)
                    w = 0;
                else
                    w = this._textWidth;
            }
            else
                w = this.width;
            if (this._heightAutoSize) {
                if (this._textHeight == 0)
                    h = 0;
                else
                    h = this._textHeight;
            }
            else
                h = this.height;
            this._updatingSize = true;
            this.setSize(w, h);
            this._updatingSize = false;
            this.doAlign();
            if (w == 0 || h == 0)
                return;
            var charX = GBasicTextField.GUTTER_X;
            var lineIndent = 0;
            var charIndent = 0;
            rectWidth = this.width - GBasicTextField.GUTTER_X * 2;
            var lineCount = this._lines.length;
            var color = this._bitmapFont.tint ? this._color : null;
            for (var i = 0; i < lineCount; i++) {
                line = this._lines[i];
                charX = GBasicTextField.GUTTER_X;
                if (this.align == "center")
                    lineIndent = (rectWidth - line.width) / 2;
                else if (this.align == "right")
                    lineIndent = rectWidth - line.width;
                else
                    lineIndent = 0;
                textLength = line.text.length;
                for (var j = 0; j < textLength; j++) {
                    ch = line.text.charAt(j);
                    cc = ch.charCodeAt(0);
                    if (cc == 10)
                        continue;
                    if (cc == 32) {
                        charX += this._letterSpacing + Math.ceil(fontSize / 2);
                        continue;
                    }
                    glyph = this._bitmapFont.glyphs[ch];
                    if (glyph != null) {
                        charIndent = (line.height + line.textHeight) / 2 - Math.ceil(glyph.lineHeight * fontScale);
                        if (glyph.texture) {
                            gr.drawTexture(glyph.texture, charX + lineIndent + Math.ceil(glyph.x * fontScale), line.y + charIndent + Math.ceil(glyph.y * fontScale), glyph.xMax * fontScale, glyph.yMax * fontScale, null, 1, color);
                        }
                        charX += this._letterSpacing + Math.ceil(glyph.advance * fontScale);
                    }
                    else {
                        charX += this._letterSpacing;
                    }
                }
            }
        }
        handleSizeChanged() {
            if (this._updatingSize)
                return;
            if (this._underConstruct)
                this._textField.size(this._width, this._height);
            else {
                if (this._bitmapFont != null) {
                    if (!this._widthAutoSize)
                        this._textField["setChanged"]();
                    else
                        this.doAlign();
                }
                else {
                    if (!this._widthAutoSize) {
                        if (!this._heightAutoSize)
                            this._textField.size(this._width, this._height);
                        else
                            this._textField.width = this._width;
                    }
                }
            }
        }
        handleGrayedChanged() {
            super.handleGrayedChanged();
            if (this.grayed)
                this._textField.color = "#AAAAAA";
            else
                this._textField.color = this._color;
        }
        doAlign() {
            if (this.valign == "top" || this._textHeight == 0)
                this._yOffset = GBasicTextField.GUTTER_Y;
            else {
                var dh = this.height - this._textHeight;
                if (dh < 0)
                    dh = 0;
                if (this.valign == "middle")
                    this._yOffset = Math.floor(dh / 2);
                else
                    this._yOffset = Math.floor(dh);
            }
            this.handleXYChanged();
        }
        flushVars() {
            this.text = this._text;
        }
    }
    GBasicTextField.GUTTER_X = 2;
    GBasicTextField.GUTTER_Y = 2;
    fgui.GBasicTextField = GBasicTextField;
    class LineInfo {
        constructor() {
            this.width = 0;
            this.height = 0;
            this.textHeight = 0;
            this.y = 0;
        }
        static borrow() {
            if (LineInfo.pool.length) {
                var ret = LineInfo.pool.pop();
                ret.width = 0;
                ret.height = 0;
                ret.textHeight = 0;
                ret.text = null;
                ret.y = 0;
                return ret;
            }
            else
                return new LineInfo();
        }
        static returns(value) {
            LineInfo.pool.push(value);
        }
        static returnList(value) {
            var length = value.length;
            for (var i = 0; i < length; i++) {
                var li = value[i];
                LineInfo.pool.push(li);
            }
            value.length = 0;
        }
    }
    LineInfo.pool = [];
    class TextExt extends Laya.Text {
        constructor(owner) {
            super();
            this._owner = owner;
        }
        baseTypeset() {
            this._lock = true;
            this.typeset();
            this._lock = false;
        }
        typeset() {
            this._sizeDirty = true;
            super.typeset();
            if (!this._lock)
                this._owner.typeset();
            if (this._isChanged) {
                Laya.timer.clear(this, this.typeset);
                this._isChanged = false;
            }
            this._sizeDirty = false;
        }
        setChanged() {
            this.isChanged = true;
        }
        set isChanged(value) {
            if (value && !this._sizeDirty) {
                if (this._owner.autoSize != fgui.AutoSizeType.None && this._owner.parent) {
                    this._sizeDirty = true;
                    this.event(fgui.Events.SIZE_DELAY_CHANGE);
                }
            }
            super["isChanged"] = value;
        }
    }
})(fgui || (fgui = {}));

(function (fgui) {
    class Margin {
        constructor() {
            this.left = 0;
            this.right = 0;
            this.top = 0;
            this.bottom = 0;
        }
        copy(source) {
            this.top = source.top;
            this.bottom = source.bottom;
            this.left = source.left;
            this.right = source.right;
        }
    }
    fgui.Margin = Margin;
})(fgui || (fgui = {}));

(function (fgui) {
    class GComponent extends fgui.GObject {
        constructor() {
            super();
            this._sortingChildCount = 0;
            this._mask = null;
            this._children = [];
            this._controllers = [];
            this._transitions = [];
            this._margin = new fgui.Margin();
            this._alignOffset = new Laya.Point();
            this._opaque = false;
            this._childrenRenderOrder = 0;
            this._apexIndex = 0;
        }
        createDisplayObject() {
            super.createDisplayObject();
            this._displayObject.mouseEnabled = true;
            this._displayObject.mouseThrough = true;
            this._container = this._displayObject;
        }
        dispose() {
            var i;
            var cnt;
            cnt = this._transitions.length;
            for (i = 0; i < cnt; ++i) {
                var trans = this._transitions[i];
                trans.dispose();
            }
            cnt = this._controllers.length;
            for (i = 0; i < cnt; ++i) {
                var cc = this._controllers[i];
                cc.dispose();
            }
            if (this.scrollPane != null)
                this.scrollPane.dispose();
            cnt = this._children.length;
            for (i = cnt - 1; i >= 0; --i) {
                var obj = this._children[i];
                obj.parent = null;
                obj.dispose();
            }
            this._boundsChanged = false;
            this._mask = null;
            super.dispose();
        }
        get displayListContainer() {
            return this._container;
        }
        addChild(child) {
            this.addChildAt(child, this._children.length);
            return child;
        }
        addChildAt(child, index = 0) {
            if (!child)
                throw "child is null";
            if (index >= 0 && index <= this._children.length) {
                if (child.parent == this) {
                    this.setChildIndex(child, index);
                }
                else {
                    child.removeFromParent();
                    child.parent = this;
                    var cnt = this._children.length;
                    if (child.sortingOrder != 0) {
                        this._sortingChildCount++;
                        index = this.getInsertPosForSortingChild(child);
                    }
                    else if (this._sortingChildCount > 0) {
                        if (index > (cnt - this._sortingChildCount))
                            index = cnt - this._sortingChildCount;
                    }
                    if (index == cnt)
                        this._children.push(child);
                    else
                        this._children.splice(index, 0, child);
                    this.childStateChanged(child);
                    this.setBoundsChangedFlag();
                }
                return child;
            }
            else {
                throw "Invalid child index";
            }
        }
        getInsertPosForSortingChild(target) {
            var cnt = this._children.length;
            var i = 0;
            for (i = 0; i < cnt; i++) {
                var child = this._children[i];
                if (child == target)
                    continue;
                if (target.sortingOrder < child.sortingOrder)
                    break;
            }
            return i;
        }
        removeChild(child, dispose) {
            var childIndex = this._children.indexOf(child);
            if (childIndex != -1) {
                this.removeChildAt(childIndex, dispose);
            }
            return child;
        }
        removeChildAt(index, dispose) {
            if (index >= 0 && index < this._children.length) {
                var child = this._children[index];
                child.parent = null;
                if (child.sortingOrder != 0)
                    this._sortingChildCount--;
                this._children.splice(index, 1);
                child.group = null;
                if (child.inContainer) {
                    this._container.removeChild(child.displayObject);
                    if (this._childrenRenderOrder == fgui.ChildrenRenderOrder.Arch)
                        Laya.timer.callLater(this, this.buildNativeDisplayList);
                }
                if (dispose)
                    child.dispose();
                this.setBoundsChangedFlag();
                return child;
            }
            else {
                throw "Invalid child index";
            }
        }
        removeChildren(beginIndex = 0, endIndex = -1, dispose) {
            if (endIndex < 0 || endIndex >= this._children.length)
                endIndex = this._children.length - 1;
            for (var i = beginIndex; i <= endIndex; ++i)
                this.removeChildAt(beginIndex, dispose);
        }
        getChildAt(index) {
            if (index >= 0 && index < this._children.length)
                return this._children[index];
            else
                throw "Invalid child index";
        }
        getChild(name) {
            var cnt = this._children.length;
            for (var i = 0; i < cnt; ++i) {
                if (this._children[i].name == name)
                    return this._children[i];
            }
            return null;
        }
        getChildByPath(path) {
            var arr = path.split(".");
            var cnt = arr.length;
            var gcom = this;
            var obj;
            for (var i = 0; i < cnt; ++i) {
                obj = gcom.getChild(arr[i]);
                if (!obj)
                    break;
                if (i != cnt - 1) {
                    if (!(gcom instanceof GComponent)) {
                        obj = null;
                        break;
                    }
                    else
                        gcom = obj;
                }
            }
            return obj;
        }
        getVisibleChild(name) {
            var cnt = this._children.length;
            for (var i = 0; i < cnt; ++i) {
                var child = this._children[i];
                if (child.internalVisible && child.internalVisible2 && child.name == name)
                    return child;
            }
            return null;
        }
        getChildInGroup(name, group) {
            var cnt = this._children.length;
            for (var i = 0; i < cnt; ++i) {
                var child = this._children[i];
                if (child.group == group && child.name == name)
                    return child;
            }
            return null;
        }
        getChildById(id) {
            var cnt = this._children.length;
            for (var i = 0; i < cnt; ++i) {
                if (this._children[i]._id == id)
                    return this._children[i];
            }
            return null;
        }
        getChildIndex(child) {
            return this._children.indexOf(child);
        }
        setChildIndex(child, index) {
            var oldIndex = this._children.indexOf(child);
            if (oldIndex == -1)
                throw "Not a child of this container";
            if (child.sortingOrder != 0)
                return;
            var cnt = this._children.length;
            if (this._sortingChildCount > 0) {
                if (index > (cnt - this._sortingChildCount - 1))
                    index = cnt - this._sortingChildCount - 1;
            }
            this._setChildIndex(child, oldIndex, index);
        }
        setChildIndexBefore(child, index) {
            var oldIndex = this._children.indexOf(child);
            if (oldIndex == -1)
                throw "Not a child of this container";
            if (child.sortingOrder != 0)
                return oldIndex;
            var cnt = this._children.length;
            if (this._sortingChildCount > 0) {
                if (index > (cnt - this._sortingChildCount - 1))
                    index = cnt - this._sortingChildCount - 1;
            }
            if (oldIndex < index)
                return this._setChildIndex(child, oldIndex, index - 1);
            else
                return this._setChildIndex(child, oldIndex, index);
        }
        _setChildIndex(child, oldIndex, index) {
            var cnt = this._children.length;
            if (index > cnt)
                index = cnt;
            if (oldIndex == index)
                return oldIndex;
            this._children.splice(oldIndex, 1);
            this._children.splice(index, 0, child);
            if (child.inContainer) {
                var displayIndex = 0;
                var g;
                var i;
                if (this._childrenRenderOrder == fgui.ChildrenRenderOrder.Ascent) {
                    for (i = 0; i < index; i++) {
                        g = this._children[i];
                        if (g.inContainer)
                            displayIndex++;
                    }
                    if (displayIndex == this._container.numChildren)
                        displayIndex--;
                    this._container.setChildIndex(child.displayObject, displayIndex);
                }
                else if (this._childrenRenderOrder == fgui.ChildrenRenderOrder.Descent) {
                    for (i = cnt - 1; i > index; i--) {
                        g = this._children[i];
                        if (g.inContainer)
                            displayIndex++;
                    }
                    if (displayIndex == this._container.numChildren)
                        displayIndex--;
                    this._container.setChildIndex(child.displayObject, displayIndex);
                }
                else {
                    Laya.timer.callLater(this, this.buildNativeDisplayList);
                }
                this.setBoundsChangedFlag();
            }
            return index;
        }
        swapChildren(child1, child2) {
            var index1 = this._children.indexOf(child1);
            var index2 = this._children.indexOf(child2);
            if (index1 == -1 || index2 == -1)
                throw "Not a child of this container";
            this.swapChildrenAt(index1, index2);
        }
        swapChildrenAt(index1, index2) {
            var child1 = this._children[index1];
            var child2 = this._children[index2];
            this.setChildIndex(child1, index2);
            this.setChildIndex(child2, index1);
        }
        get numChildren() {
            return this._children.length;
        }
        isAncestorOf(child) {
            if (child == null)
                return false;
            var p = child.parent;
            while (p) {
                if (p == this)
                    return true;
                p = p.parent;
            }
            return false;
        }
        addController(controller) {
            this._controllers.push(controller);
            controller.parent = this;
            this.applyController(controller);
        }
        getControllerAt(index) {
            return this._controllers[index];
        }
        getController(name) {
            var cnt = this._controllers.length;
            for (var i = 0; i < cnt; ++i) {
                var c = this._controllers[i];
                if (c.name == name)
                    return c;
            }
            return null;
        }
        removeController(c) {
            var index = this._controllers.indexOf(c);
            if (index == -1)
                throw new Error("controller not exists");
            c.parent = null;
            this._controllers.splice(index, 1);
            var length = this._children.length;
            for (var i = 0; i < length; i++) {
                var child = this._children[i];
                child.handleControllerChanged(c);
            }
        }
        get controllers() {
            return this._controllers;
        }
        childStateChanged(child) {
            if (this._buildingDisplayList)
                return;
            var cnt = this._children.length;
            if (child instanceof fgui.GGroup) {
                for (var i = 0; i < cnt; i++) {
                    var g = this._children[i];
                    if (g.group == child)
                        this.childStateChanged(g);
                }
                return;
            }
            if (!child.displayObject)
                return;
            if (child.internalVisible && child.displayObject != this._displayObject.mask) {
                if (!child.displayObject.parent) {
                    var index = 0;
                    if (this._childrenRenderOrder == fgui.ChildrenRenderOrder.Ascent) {
                        for (i = 0; i < cnt; i++) {
                            g = this._children[i];
                            if (g == child)
                                break;
                            if (g.displayObject != null && g.displayObject.parent != null)
                                index++;
                        }
                        this._container.addChildAt(child.displayObject, index);
                    }
                    else if (this._childrenRenderOrder == fgui.ChildrenRenderOrder.Descent) {
                        for (i = cnt - 1; i >= 0; i--) {
                            g = this._children[i];
                            if (g == child)
                                break;
                            if (g.displayObject != null && g.displayObject.parent != null)
                                index++;
                        }
                        this._container.addChildAt(child.displayObject, index);
                    }
                    else {
                        this._container.addChild(child.displayObject);
                        Laya.timer.callLater(this, this.buildNativeDisplayList);
                    }
                }
            }
            else {
                if (child.displayObject.parent) {
                    this._container.removeChild(child.displayObject);
                    if (this._childrenRenderOrder == fgui.ChildrenRenderOrder.Arch)
                        Laya.timer.callLater(this, this.buildNativeDisplayList);
                }
            }
        }
        buildNativeDisplayList() {
            if (!this._displayObject)
                return;
            var cnt = this._children.length;
            if (cnt == 0)
                return;
            var i;
            var child;
            switch (this._childrenRenderOrder) {
                case fgui.ChildrenRenderOrder.Ascent:
                    {
                        for (i = 0; i < cnt; i++) {
                            child = this._children[i];
                            if (child.displayObject != null && child.internalVisible)
                                this._container.addChild(child.displayObject);
                        }
                    }
                    break;
                case fgui.ChildrenRenderOrder.Descent:
                    {
                        for (i = cnt - 1; i >= 0; i--) {
                            child = this._children[i];
                            if (child.displayObject != null && child.internalVisible)
                                this._container.addChild(child.displayObject);
                        }
                    }
                    break;
                case fgui.ChildrenRenderOrder.Arch:
                    {
                        var apex = fgui.ToolSet.clamp(this._apexIndex, 0, cnt);
                        for (i = 0; i < apex; i++) {
                            child = this._children[i];
                            if (child.displayObject != null && child.internalVisible)
                                this._container.addChild(child.displayObject);
                        }
                        for (i = cnt - 1; i >= apex; i--) {
                            child = this._children[i];
                            if (child.displayObject != null && child.internalVisible)
                                this._container.addChild(child.displayObject);
                        }
                    }
                    break;
            }
        }
        applyController(c) {
            this._applyingController = c;
            var child;
            var length = this._children.length;
            for (var i = 0; i < length; i++) {
                child = this._children[i];
                child.handleControllerChanged(c);
            }
            this._applyingController = null;
            c.runActions();
        }
        applyAllControllers() {
            var cnt = this._controllers.length;
            for (var i = 0; i < cnt; ++i) {
                this.applyController(this._controllers[i]);
            }
        }
        adjustRadioGroupDepth(obj, c) {
            var cnt = this._children.length;
            var i;
            var child;
            var myIndex = -1, maxIndex = -1;
            for (i = 0; i < cnt; i++) {
                child = this._children[i];
                if (child == obj) {
                    myIndex = i;
                }
                else if ((child instanceof fgui.GButton)
                    && (child).relatedController == c) {
                    if (i > maxIndex)
                        maxIndex = i;
                }
            }
            if (myIndex < maxIndex) {
                if (this._applyingController != null)
                    this._children[maxIndex].handleControllerChanged(this._applyingController);
                this.swapChildrenAt(myIndex, maxIndex);
            }
        }
        getTransitionAt(index) {
            return this._transitions[index];
        }
        getTransition(transName) {
            var cnt = this._transitions.length;
            for (var i = 0; i < cnt; ++i) {
                var trans = this._transitions[i];
                if (trans.name == transName)
                    return trans;
            }
            return null;
        }
        isChildInView(child) {
            if (this._displayObject.scrollRect != null) {
                return child.x + child.width >= 0 && child.x <= this.width
                    && child.y + child.height >= 0 && child.y <= this.height;
            }
            else if (this._scrollPane != null) {
                return this._scrollPane.isChildInView(child);
            }
            else
                return true;
        }
        getFirstChildInView() {
            var cnt = this._children.length;
            for (var i = 0; i < cnt; ++i) {
                var child = this._children[i];
                if (this.isChildInView(child))
                    return i;
            }
            return -1;
        }
        get scrollPane() {
            return this._scrollPane;
        }
        get opaque() {
            return this._opaque;
        }
        set opaque(value) {
            if (this._opaque != value) {
                this._opaque = value;
                if (this._opaque) {
                    if (this._displayObject.hitArea == null)
                        this._displayObject.hitArea = new Laya.Rectangle();
                    if (this._displayObject.hitArea instanceof Laya.Rectangle)
                        this._displayObject.hitArea.setTo(0, 0, this._width, this._height);
                    this._displayObject.mouseThrough = false;
                }
                else {
                    if (this._displayObject.hitArea instanceof Laya.Rectangle)
                        this._displayObject.hitArea = null;
                    this._displayObject.mouseThrough = true;
                }
            }
        }
        get margin() {
            return this._margin;
        }
        set margin(value) {
            this._margin.copy(value);
            if (this._displayObject.scrollRect != null) {
                this._container.pos(this._margin.left + this._alignOffset.x, this._margin.top + this._alignOffset.y);
            }
            this.handleSizeChanged();
        }
        get childrenRenderOrder() {
            return this._childrenRenderOrder;
        }
        set childrenRenderOrder(value) {
            if (this._childrenRenderOrder != value) {
                this._childrenRenderOrder = value;
                this.buildNativeDisplayList();
            }
        }
        get apexIndex() {
            return this._apexIndex;
        }
        set apexIndex(value) {
            if (this._apexIndex != value) {
                this._apexIndex = value;
                if (this._childrenRenderOrder == fgui.ChildrenRenderOrder.Arch)
                    this.buildNativeDisplayList();
            }
        }
        get mask() {
            return this._mask;
        }
        set mask(value) {
            this.setMask(value, false);
        }
        setMask(value, reversed) {
            if (this._mask && this._mask != value) {
                if (this._mask.blendMode == "destination-out")
                    this._mask.blendMode = null;
            }
            this._mask = value;
            if (!this._mask) {
                this._displayObject.mask = null;
                if (this._displayObject.hitArea instanceof fgui.ChildHitArea)
                    this._displayObject.hitArea = null;
                return;
            }
            if (this._mask.hitArea) {
                this._displayObject.hitArea = new fgui.ChildHitArea(this._mask, reversed);
                this._displayObject.mouseThrough = false;
                this._displayObject.hitTestPrior = true;
            }
            if (reversed) {
                this._displayObject.mask = null;
                this._displayObject.cacheAs = "bitmap";
                this._mask.blendMode = "destination-out";
            }
            else
                this._displayObject.mask = this._mask;
        }
        get baseUserData() {
            var buffer = this.packageItem.rawData;
            buffer.seek(0, 4);
            return buffer.readS();
        }
        updateHitArea() {
            if (this._displayObject.hitArea instanceof fgui.PixelHitTest) {
                var hitTest = (this._displayObject.hitArea);
                if (this.sourceWidth != 0)
                    hitTest.scaleX = this._width / this.sourceWidth;
                if (this.sourceHeight != 0)
                    hitTest.scaleY = this._height / this.sourceHeight;
            }
            else if (this._displayObject.hitArea instanceof Laya.Rectangle) {
                this._displayObject.hitArea.setTo(0, 0, this._width, this._height);
            }
        }
        updateMask() {
            var rect = this._displayObject.scrollRect;
            if (rect == null)
                rect = new Laya.Rectangle();
            rect.x = this._margin.left;
            rect.y = this._margin.top;
            rect.width = this._width - this._margin.right;
            rect.height = this._height - this._margin.bottom;
            this._displayObject.scrollRect = rect;
        }
        setupScroll(buffer) {
            if (this._displayObject == this._container) {
                this._container = new Laya.Sprite();
                this._displayObject.addChild(this._container);
            }
            this._scrollPane = new fgui.ScrollPane(this);
            this._scrollPane.setup(buffer);
        }
        setupOverflow(overflow) {
            if (overflow == fgui.OverflowType.Hidden) {
                if (this._displayObject == this._container) {
                    this._container = new Laya.Sprite();
                    this._displayObject.addChild(this._container);
                }
                this.updateMask();
                this._container.pos(this._margin.left, this._margin.top);
            }
            else if (this._margin.left != 0 || this._margin.top != 0) {
                if (this._displayObject == this._container) {
                    this._container = new Laya.Sprite();
                    this._displayObject.addChild(this._container);
                }
                this._container.pos(this._margin.left, this._margin.top);
            }
        }
        handleSizeChanged() {
            super.handleSizeChanged();
            if (this._scrollPane)
                this._scrollPane.onOwnerSizeChanged();
            else if (this._displayObject.scrollRect != null)
                this.updateMask();
            if (this._displayObject.hitArea != null)
                this.updateHitArea();
        }
        handleGrayedChanged() {
            var c = this.getController("grayed");
            if (c != null) {
                c.selectedIndex = this.grayed ? 1 : 0;
                return;
            }
            var v = this.grayed;
            var cnt = this._children.length;
            for (var i = 0; i < cnt; ++i) {
                this._children[i].grayed = v;
            }
        }
        handleControllerChanged(c) {
            super.handleControllerChanged(c);
            if (this._scrollPane != null)
                this._scrollPane.handleControllerChanged(c);
        }
        setBoundsChangedFlag() {
            if (!this._scrollPane && !this._trackBounds)
                return;
            if (!this._boundsChanged) {
                this._boundsChanged = true;
                Laya.timer.callLater(this, this.__render);
            }
        }
        __render() {
            if (this._boundsChanged) {
                var i1 = 0;
                var len = this._children.length;
                var child;
                for (i1 = 0; i1 < len; i1++) {
                    child = this._children[i1];
                    child.ensureSizeCorrect();
                }
                this.updateBounds();
            }
        }
        ensureBoundsCorrect() {
            var i1 = 0;
            var len = this._children.length;
            var child;
            for (i1 = 0; i1 < len; i1++) {
                child = this._children[i1];
                child.ensureSizeCorrect();
            }
            if (this._boundsChanged)
                this.updateBounds();
        }
        updateBounds() {
            var ax = 0, ay = 0, aw = 0, ah = 0;
            var len = this._children.length;
            if (len > 0) {
                ax = Number.POSITIVE_INFINITY, ay = Number.POSITIVE_INFINITY;
                var ar = Number.NEGATIVE_INFINITY, ab = Number.NEGATIVE_INFINITY;
                var tmp = 0;
                var i1 = 0;
                for (i1 = 0; i1 < len; i1++) {
                    var child = this._children[i1];
                    tmp = child.x;
                    if (tmp < ax)
                        ax = tmp;
                    tmp = child.y;
                    if (tmp < ay)
                        ay = tmp;
                    tmp = child.x + child.actualWidth;
                    if (tmp > ar)
                        ar = tmp;
                    tmp = child.y + child.actualHeight;
                    if (tmp > ab)
                        ab = tmp;
                }
                aw = ar - ax;
                ah = ab - ay;
            }
            this.setBounds(ax, ay, aw, ah);
        }
        setBounds(ax, ay, aw, ah) {
            this._boundsChanged = false;
            if (this._scrollPane)
                this._scrollPane.setContentSize(Math.round(ax + aw), Math.round(ay + ah));
        }
        get viewWidth() {
            if (this._scrollPane != null)
                return this._scrollPane.viewWidth;
            else
                return this.width - this._margin.left - this._margin.right;
        }
        set viewWidth(value) {
            if (this._scrollPane != null)
                this._scrollPane.viewWidth = value;
            else
                this.width = value + this._margin.left + this._margin.right;
        }
        get viewHeight() {
            if (this._scrollPane != null)
                return this._scrollPane.viewHeight;
            else
                return this.height - this._margin.top - this._margin.bottom;
        }
        set viewHeight(value) {
            if (this._scrollPane != null)
                this._scrollPane.viewHeight = value;
            else
                this.height = value + this._margin.top + this._margin.bottom;
        }
        getSnappingPosition(xValue, yValue, resultPoint = null) {
            return this.getSnappingPositionWithDir(xValue, yValue, 0, 0, resultPoint);
        }
        getSnappingPositionWithDir(xValue, yValue, xDir, yDir, resultPoint = null) {
            if (!resultPoint)
                resultPoint = new Laya.Point();
            var cnt = this._children.length;
            if (cnt == 0) {
                resultPoint.x = 0;
                resultPoint.y = 0;
                return resultPoint;
            }
            this.ensureBoundsCorrect();
            var obj = null;
            var prev = null;
            var i = 0;
            if (yValue != 0) {
                for (; i < cnt; i++) {
                    obj = this._children[i];
                    if (yValue < obj.y) {
                        if (i == 0) {
                            yValue = 0;
                            break;
                        }
                        else {
                            prev = this._children[i - 1];
                            if (yValue < prev.y + prev.actualHeight / 2)
                                yValue = prev.y;
                            else
                                yValue = obj.y;
                            break;
                        }
                    }
                }
                if (i == cnt)
                    yValue = obj.y;
            }
            if (xValue != 0) {
                if (i > 0)
                    i--;
                for (; i < cnt; i++) {
                    obj = this._children[i];
                    if (xValue < obj.x) {
                        if (i == 0) {
                            xValue = 0;
                            break;
                        }
                        else {
                            prev = this._children[i - 1];
                            if (xValue < prev.x + prev.actualWidth / 2)
                                xValue = prev.x;
                            else
                                xValue = obj.x;
                            break;
                        }
                    }
                }
                if (i == cnt)
                    xValue = obj.x;
            }
            resultPoint.x = xValue;
            resultPoint.y = yValue;
            return resultPoint;
        }
        childSortingOrderChanged(child, oldValue, newValue = 0) {
            if (newValue == 0) {
                this._sortingChildCount--;
                this.setChildIndex(child, this._children.length);
            }
            else {
                if (oldValue == 0)
                    this._sortingChildCount++;
                var oldIndex = this._children.indexOf(child);
                var index = this.getInsertPosForSortingChild(child);
                if (oldIndex < index)
                    this._setChildIndex(child, oldIndex, index - 1);
                else
                    this._setChildIndex(child, oldIndex, index);
            }
        }
        constructFromResource() {
            this.constructFromResource2(null, 0);
        }
        constructFromResource2(objectPool, poolIndex) {
            if (!this.packageItem.decoded) {
                this.packageItem.decoded = true;
                fgui.TranslationHelper.translateComponent(this.packageItem);
            }
            var i;
            var dataLen;
            var curPos;
            var nextPos;
            var f1;
            var f2;
            var i1;
            var i2;
            var buffer = this.packageItem.rawData;
            buffer.seek(0, 0);
            this._underConstruct = true;
            this.sourceWidth = buffer.getInt32();
            this.sourceHeight = buffer.getInt32();
            this.initWidth = this.sourceWidth;
            this.initHeight = this.sourceHeight;
            this.setSize(this.sourceWidth, this.sourceHeight);
            if (buffer.readBool()) {
                this.minWidth = buffer.getInt32();
                this.maxWidth = buffer.getInt32();
                this.minHeight = buffer.getInt32();
                this.maxHeight = buffer.getInt32();
            }
            if (buffer.readBool()) {
                f1 = buffer.getFloat32();
                f2 = buffer.getFloat32();
                this.internalSetPivot(f1, f2, buffer.readBool());
            }
            if (buffer.readBool()) {
                this._margin.top = buffer.getInt32();
                this._margin.bottom = buffer.getInt32();
                this._margin.left = buffer.getInt32();
                this._margin.right = buffer.getInt32();
            }
            var overflow = buffer.readByte();
            if (overflow == fgui.OverflowType.Scroll) {
                var savedPos = buffer.pos;
                buffer.seek(0, 7);
                this.setupScroll(buffer);
                buffer.pos = savedPos;
            }
            else
                this.setupOverflow(overflow);
            if (buffer.readBool())
                buffer.skip(8);
            this._buildingDisplayList = true;
            buffer.seek(0, 1);
            var controllerCount = buffer.getInt16();
            for (i = 0; i < controllerCount; i++) {
                nextPos = buffer.getInt16();
                nextPos += buffer.pos;
                var controller = new fgui.Controller();
                this._controllers.push(controller);
                controller.parent = this;
                controller.setup(buffer);
                buffer.pos = nextPos;
            }
            buffer.seek(0, 2);
            var child;
            var childCount = buffer.getInt16();
            for (i = 0; i < childCount; i++) {
                dataLen = buffer.getInt16();
                curPos = buffer.pos;
                if (objectPool != null)
                    child = objectPool[poolIndex + i];
                else {
                    buffer.seek(curPos, 0);
                    var type = buffer.readByte();
                    var src = buffer.readS();
                    var pkgId = buffer.readS();
                    var pi = null;
                    if (src != null) {
                        var pkg;
                        if (pkgId != null)
                            pkg = fgui.UIPackage.getById(pkgId);
                        else
                            pkg = this.packageItem.owner;
                        pi = pkg != null ? pkg.getItemById(src) : null;
                    }
                    if (pi != null) {
                        child = fgui.UIObjectFactory.newObject(pi);
                        child.packageItem = pi;
                        child.constructFromResource();
                    }
                    else
                        child = fgui.UIObjectFactory.newObject2(type);
                }
                child._underConstruct = true;
                child.setup_beforeAdd(buffer, curPos);
                child.parent = this;
                this._children.push(child);
                buffer.pos = curPos + dataLen;
            }
            buffer.seek(0, 3);
            this.relations.setup(buffer, true);
            buffer.seek(0, 2);
            buffer.skip(2);
            for (i = 0; i < childCount; i++) {
                nextPos = buffer.getInt16();
                nextPos += buffer.pos;
                buffer.seek(buffer.pos, 3);
                this._children[i].relations.setup(buffer, false);
                buffer.pos = nextPos;
            }
            buffer.seek(0, 2);
            buffer.skip(2);
            for (i = 0; i < childCount; i++) {
                nextPos = buffer.getInt16();
                nextPos += buffer.pos;
                child = this._children[i];
                child.setup_afterAdd(buffer, buffer.pos);
                child._underConstruct = false;
                buffer.pos = nextPos;
            }
            buffer.seek(0, 4);
            buffer.skip(2);
            this.opaque = buffer.readBool();
            var maskId = buffer.getInt16();
            if (maskId != -1) {
                this.setMask(this.getChildAt(maskId).displayObject, buffer.readBool());
            }
            var hitTestId = buffer.readS();
            i1 = buffer.getInt32();
            i2 = buffer.getInt32();
            var hitArea;
            if (hitTestId) {
                pi = this.packageItem.owner.getItemById(hitTestId);
                if (pi && pi.pixelHitTestData)
                    hitArea = new fgui.PixelHitTest(pi.pixelHitTestData, i1, i2);
            }
            else if (i1 != 0 && i2 != -1) {
                hitArea = new fgui.ChildHitArea(this.getChildAt(i2).displayObject);
            }
            if (hitArea) {
                this._displayObject.hitArea = hitArea;
                this._displayObject.mouseThrough = false;
                this._displayObject.hitTestPrior = true;
            }
            buffer.seek(0, 5);
            var transitionCount = buffer.getInt16();
            for (i = 0; i < transitionCount; i++) {
                nextPos = buffer.getInt16();
                nextPos += buffer.pos;
                var trans = new fgui.Transition(this);
                trans.setup(buffer);
                this._transitions.push(trans);
                buffer.pos = nextPos;
            }
            if (this._transitions.length > 0) {
                this.displayObject.on(Laya.Event.DISPLAY, this, this.___added);
                this.displayObject.on(Laya.Event.UNDISPLAY, this, this.___removed);
            }
            this.applyAllControllers();
            this._buildingDisplayList = false;
            this._underConstruct = false;
            this.buildNativeDisplayList();
            this.setBoundsChangedFlag();
            if (this.packageItem.objectType != fgui.ObjectType.Component)
                this.constructExtension(buffer);
            this.onConstruct();
        }
        constructExtension(buffer) {
        }
        onConstruct() {
            this.constructFromXML(null);
        }
        constructFromXML(xml) {
        }
        setup_afterAdd(buffer, beginPos) {
            super.setup_afterAdd(buffer, beginPos);
            buffer.seek(beginPos, 4);
            var pageController = buffer.getInt16();
            if (pageController != -1 && this._scrollPane != null)
                this._scrollPane.pageController = this._parent.getControllerAt(pageController);
            var cnt;
            var i;
            cnt = buffer.getInt16();
            for (i = 0; i < cnt; i++) {
                var cc = this.getController(buffer.readS());
                var pageId = buffer.readS();
                if (cc)
                    cc.selectedPageId = pageId;
            }
            if (buffer.version >= 2) {
                cnt = buffer.getInt16();
                for (i = 0; i < cnt; i++) {
                    var target = buffer.readS();
                    var propertyId = buffer.getInt16();
                    var value = buffer.readS();
                    var obj = this.getChildByPath(target);
                    if (obj)
                        obj.setProp(propertyId, value);
                }
            }
        }
        ___added() {
            var cnt = this._transitions.length;
            for (var i = 0; i < cnt; ++i) {
                this._transitions[i].onOwnerAddedToStage();
            }
        }
        ___removed() {
            var cnt = this._transitions.length;
            for (var i = 0; i < cnt; ++i) {
                this._transitions[i].onOwnerRemovedFromStage();
            }
        }
    }
    fgui.GComponent = GComponent;
})(fgui || (fgui = {}));

(function (fgui) {
    class GButton extends fgui.GComponent {
        constructor() {
            super();
            this._soundVolumeScale = 0;
            this._downEffect = 0;
            this._downEffectValue = 0;
            this._downScaled = false;
            this._mode = fgui.ButtonMode.Common;
            this._title = "";
            this._icon = "";
            this._sound = fgui.UIConfig.buttonSound;
            this._soundVolumeScale = fgui.UIConfig.buttonSoundVolumeScale;
            this._changeStateOnClick = true;
            this._downEffectValue = 0.8;
        }
        get icon() {
            return this._icon;
        }
        set icon(value) {
            this._icon = value;
            value = (this._selected && this._selectedIcon) ? this._selectedIcon : this._icon;
            if (this._iconObject != null)
                this._iconObject.icon = value;
            this.updateGear(7);
        }
        get selectedIcon() {
            return this._selectedIcon;
        }
        set selectedIcon(value) {
            this._selectedIcon = value;
            value = (this._selected && this._selectedIcon) ? this._selectedIcon : this._icon;
            if (this._iconObject != null)
                this._iconObject.icon = value;
        }
        get title() {
            return this._title;
        }
        set title(value) {
            this._title = value;
            if (this._titleObject)
                this._titleObject.text = (this._selected && this._selectedTitle) ? this._selectedTitle : this._title;
            this.updateGear(6);
        }
        get text() {
            return this.title;
        }
        set text(value) {
            this.title = value;
        }
        get selectedTitle() {
            return this._selectedTitle;
        }
        set selectedTitle(value) {
            this._selectedTitle = value;
            if (this._titleObject)
                this._titleObject.text = (this._selected && this._selectedTitle) ? this._selectedTitle : this._title;
        }
        get titleColor() {
            var tf = this.getTextField();
            if (tf != null)
                return tf.color;
            else
                return "#000000";
        }
        set titleColor(value) {
            var tf = this.getTextField();
            if (tf != null)
                tf.color = value;
            this.updateGear(4);
        }
        get titleFontSize() {
            var tf = this.getTextField();
            if (tf != null)
                return tf.fontSize;
            else
                return 0;
        }
        set titleFontSize(value) {
            var tf = this.getTextField();
            if (tf != null)
                tf.fontSize = value;
        }
        get sound() {
            return this._sound;
        }
        set sound(val) {
            this._sound = val;
        }
        get soundVolumeScale() {
            return this._soundVolumeScale;
        }
        set soundVolumeScale(value) {
            this._soundVolumeScale = value;
        }
        set selected(val) {
            if (this._mode == fgui.ButtonMode.Common)
                return;
            if (this._selected != val) {
                this._selected = val;
                if (this.grayed && this._buttonController && this._buttonController.hasPage(GButton.DISABLED)) {
                    if (this._selected)
                        this.setState(GButton.SELECTED_DISABLED);
                    else
                        this.setState(GButton.DISABLED);
                }
                else {
                    if (this._selected)
                        this.setState(this._over ? GButton.SELECTED_OVER : GButton.DOWN);
                    else
                        this.setState(this._over ? GButton.OVER : GButton.UP);
                }
                if (this._selectedTitle && this._titleObject)
                    this._titleObject.text = this._selected ? this._selectedTitle : this._title;
                if (this._selectedIcon) {
                    var str = this._selected ? this._selectedIcon : this._icon;
                    if (this._iconObject != null)
                        this._iconObject.icon = str;
                }
                if (this._relatedController
                    && this._parent
                    && !this._parent._buildingDisplayList) {
                    if (this._selected) {
                        this._relatedController.selectedPageId = this._relatedPageId;
                        if (this._relatedController.autoRadioGroupDepth)
                            this._parent.adjustRadioGroupDepth(this, this._relatedController);
                    }
                    else if (this._mode == fgui.ButtonMode.Check && this._relatedController.selectedPageId == this._relatedPageId)
                        this._relatedController.oppositePageId = this._relatedPageId;
                }
            }
        }
        get selected() {
            return this._selected;
        }
        get mode() {
            return this._mode;
        }
        set mode(value) {
            if (this._mode != value) {
                if (value == fgui.ButtonMode.Common)
                    this.selected = false;
                this._mode = value;
            }
        }
        get relatedController() {
            return this._relatedController;
        }
        set relatedController(val) {
            if (val != this._relatedController) {
                this._relatedController = val;
                this._relatedPageId = null;
            }
        }
        get relatedPageId() {
            return this._relatedPageId;
        }
        set relatedPageId(val) {
            this._relatedPageId = val;
        }
        get changeStateOnClick() {
            return this._changeStateOnClick;
        }
        set changeStateOnClick(value) {
            this._changeStateOnClick = value;
        }
        get linkedPopup() {
            return this._linkedPopup;
        }
        set linkedPopup(value) {
            this._linkedPopup = value;
        }
        getTextField() {
            if (this._titleObject instanceof fgui.GTextField)
                return this._titleObject;
            else if (this._titleObject instanceof fgui.GLabel)
                return (this._titleObject).getTextField();
            else if (this._titleObject instanceof GButton)
                return this._titleObject.getTextField();
            else
                return null;
        }
        fireClick(downEffect = true) {
            if (downEffect && this._mode == fgui.ButtonMode.Common) {
                this.setState(GButton.OVER);
                Laya.timer.once(100, this, this.setState, [GButton.DOWN], false);
                Laya.timer.once(200, this, this.setState, [GButton.UP], false);
            }
            this.__click(fgui.Events.createEvent(Laya.Event.CLICK, this.displayObject));
        }
        setState(val) {
            if (this._buttonController)
                this._buttonController.selectedPage = val;
            if (this._downEffect == 1) {
                var cnt = this.numChildren;
                if (val == GButton.DOWN || val == GButton.SELECTED_OVER || val == GButton.SELECTED_DISABLED) {
                    var r = this._downEffectValue * 255;
                    var color = Laya.Utils.toHexColor((r << 16) + (r << 8) + r);
                    for (var i = 0; i < cnt; i++) {
                        var obj = this.getChildAt(i);
                        if (!(obj instanceof fgui.GTextField))
                            obj.setProp(fgui.ObjectPropID.Color, color);
                    }
                }
                else {
                    for (i = 0; i < cnt; i++) {
                        obj = this.getChildAt(i);
                        if (!(obj instanceof fgui.GTextField))
                            obj.setProp(fgui.ObjectPropID.Color, "#FFFFFF");
                    }
                }
            }
            else if (this._downEffect == 2) {
                if (val == GButton.DOWN || val == GButton.SELECTED_OVER || val == GButton.SELECTED_DISABLED) {
                    if (!this._downScaled) {
                        this.setScale(this.scaleX * this._downEffectValue, this.scaleY * this._downEffectValue);
                        this._downScaled = true;
                    }
                }
                else {
                    if (this._downScaled) {
                        this.setScale(this.scaleX / this._downEffectValue, this.scaleY / this._downEffectValue);
                        this._downScaled = false;
                    }
                }
            }
        }
        handleControllerChanged(c) {
            super.handleControllerChanged(c);
            if (this._relatedController == c)
                this.selected = this._relatedPageId == c.selectedPageId;
        }
        handleGrayedChanged() {
            if (this._buttonController && this._buttonController.hasPage(GButton.DISABLED)) {
                if (this.grayed) {
                    if (this._selected && this._buttonController.hasPage(GButton.SELECTED_DISABLED))
                        this.setState(GButton.SELECTED_DISABLED);
                    else
                        this.setState(GButton.DISABLED);
                }
                else if (this._selected)
                    this.setState(GButton.DOWN);
                else
                    this.setState(GButton.UP);
            }
            else
                super.handleGrayedChanged();
        }
        getProp(index) {
            switch (index) {
                case fgui.ObjectPropID.Color:
                    return this.titleColor;
                case fgui.ObjectPropID.OutlineColor:
                    {
                        var tf = this.getTextField();
                        if (tf)
                            return tf.strokeColor;
                        else
                            return 0;
                    }
                case fgui.ObjectPropID.FontSize:
                    return this.titleFontSize;
                case fgui.ObjectPropID.Selected:
                    return this.selected;
                default:
                    return super.getProp(index);
            }
        }
        setProp(index, value) {
            switch (index) {
                case fgui.ObjectPropID.Color:
                    this.titleColor = value;
                    break;
                case fgui.ObjectPropID.OutlineColor:
                    {
                        var tf = this.getTextField();
                        if (tf)
                            tf.strokeColor = value;
                    }
                    break;
                case fgui.ObjectPropID.FontSize:
                    this.titleFontSize = value;
                    break;
                case fgui.ObjectPropID.Selected:
                    this.selected = value;
                    break;
                default:
                    super.setProp(index, value);
                    break;
            }
        }
        constructExtension(buffer) {
            buffer.seek(0, 6);
            this._mode = buffer.readByte();
            var str = buffer.readS();
            if (str)
                this._sound = str;
            this._soundVolumeScale = buffer.getFloat32();
            this._downEffect = buffer.readByte();
            this._downEffectValue = buffer.getFloat32();
            if (this._downEffect == 2)
                this.setPivot(0.5, 0.5, this.pivotAsAnchor);
            this._buttonController = this.getController("button");
            this._titleObject = this.getChild("title");
            this._iconObject = this.getChild("icon");
            if (this._titleObject != null)
                this._title = this._titleObject.text;
            if (this._iconObject != null)
                this._icon = this._iconObject.icon;
            if (this._mode == fgui.ButtonMode.Common)
                this.setState(GButton.UP);
            this.on(Laya.Event.ROLL_OVER, this, this.__rollover);
            this.on(Laya.Event.ROLL_OUT, this, this.__rollout);
            this.on(Laya.Event.MOUSE_DOWN, this, this.__mousedown);
            this.on(Laya.Event.CLICK, this, this.__click);
        }
        setup_afterAdd(buffer, beginPos) {
            super.setup_afterAdd(buffer, beginPos);
            if (!buffer.seek(beginPos, 6))
                return;
            if (buffer.readByte() != this.packageItem.objectType)
                return;
            var str;
            var iv;
            str = buffer.readS();
            if (str != null)
                this.title = str;
            str = buffer.readS();
            if (str != null)
                this.selectedTitle = str;
            str = buffer.readS();
            if (str != null)
                this.icon = str;
            str = buffer.readS();
            if (str != null)
                this.selectedIcon = str;
            if (buffer.readBool())
                this.titleColor = buffer.readColorS();
            iv = buffer.getInt32();
            if (iv != 0)
                this.titleFontSize = iv;
            iv = buffer.getInt16();
            if (iv >= 0)
                this._relatedController = this.parent.getControllerAt(iv);
            this._relatedPageId = buffer.readS();
            str = buffer.readS();
            if (str != null)
                this._sound = str;
            if (buffer.readBool())
                this._soundVolumeScale = buffer.getFloat32();
            this.selected = buffer.readBool();
        }
        __rollover() {
            if (!this._buttonController || !this._buttonController.hasPage(GButton.OVER))
                return;
            this._over = true;
            if (this._down)
                return;
            if (this.grayed && this._buttonController.hasPage(GButton.DISABLED))
                return;
            this.setState(this._selected ? GButton.SELECTED_OVER : GButton.OVER);
        }
        __rollout() {
            if (!this._buttonController || !this._buttonController.hasPage(GButton.OVER))
                return;
            this._over = false;
            if (this._down)
                return;
            if (this.grayed && this._buttonController.hasPage(GButton.DISABLED))
                return;
            this.setState(this._selected ? GButton.DOWN : GButton.UP);
        }
        __mousedown(evt) {
            this._down = true;
            fgui.GRoot.inst.checkPopups(evt.target);
            Laya.stage.on(Laya.Event.MOUSE_UP, this, this.__mouseup);
            if (this._mode == fgui.ButtonMode.Common) {
                if (this.grayed && this._buttonController && this._buttonController.hasPage(GButton.DISABLED))
                    this.setState(GButton.SELECTED_DISABLED);
                else
                    this.setState(GButton.DOWN);
            }
            if (this._linkedPopup != null) {
                if (this._linkedPopup instanceof fgui.Window)
                    this._linkedPopup.toggleStatus();
                else
                    this.root.togglePopup(this._linkedPopup, this);
            }
        }
        __mouseup() {
            if (this._down) {
                Laya.stage.off(Laya.Event.MOUSE_UP, this, this.__mouseup);
                this._down = false;
                if (this._displayObject == null)
                    return;
                if (this._mode == fgui.ButtonMode.Common) {
                    if (this.grayed && this._buttonController && this._buttonController.hasPage(GButton.DISABLED))
                        this.setState(GButton.DISABLED);
                    else if (this._over)
                        this.setState(GButton.OVER);
                    else
                        this.setState(GButton.UP);
                }
            }
        }
        __click(evt) {
            if (this._sound) {
                var pi = fgui.UIPackage.getItemByURL(this._sound);
                if (pi)
                    fgui.GRoot.inst.playOneShotSound(pi.file);
                else
                    fgui.GRoot.inst.playOneShotSound(this._sound);
            }
            if (this._mode == fgui.ButtonMode.Check) {
                if (this._changeStateOnClick) {
                    this.selected = !this._selected;
                    fgui.Events.dispatch(fgui.Events.STATE_CHANGED, this.displayObject, evt);
                }
            }
            else if (this._mode == fgui.ButtonMode.Radio) {
                if (this._changeStateOnClick && !this._selected) {
                    this.selected = true;
                    fgui.Events.dispatch(fgui.Events.STATE_CHANGED, this.displayObject, evt);
                }
            }
            else {
                if (this._relatedController)
                    this._relatedController.selectedPageId = this._relatedPageId;
            }
        }
    }
    GButton.UP = "up";
    GButton.DOWN = "down";
    GButton.OVER = "over";
    GButton.SELECTED_OVER = "selectedOver";
    GButton.DISABLED = "disabled";
    GButton.SELECTED_DISABLED = "selectedDisabled";
    fgui.GButton = GButton;
})(fgui || (fgui = {}));

(function (fgui) {
    class GComboBox extends fgui.GComponent {
        constructor() {
            super();
            this._visibleItemCount = fgui.UIConfig.defaultComboBoxVisibleItemCount;
            this._itemsUpdated = true;
            this._selectedIndex = -1;
            this._popupDirection = 0;
            this._items = [];
            this._values = [];
        }
        get text() {
            if (this._titleObject)
                return this._titleObject.text;
            else
                return null;
        }
        set text(value) {
            if (this._titleObject)
                this._titleObject.text = value;
            this.updateGear(6);
        }
        get titleColor() {
            var tf = this.getTextField();
            if (tf != null)
                return tf.color;
            else
                return "#000000";
        }
        set titleColor(value) {
            var tf = this.getTextField();
            if (tf != null)
                tf.color = value;
            this.updateGear(4);
        }
        get titleFontSize() {
            var tf = this.getTextField();
            if (tf != null)
                return tf.fontSize;
            else
                return 0;
        }
        set titleFontSize(value) {
            var tf = this.getTextField();
            if (tf != null)
                tf.fontSize = value;
        }
        get icon() {
            if (this._iconObject)
                return this._iconObject.icon;
            else
                return null;
        }
        set icon(value) {
            if (this._iconObject)
                this._iconObject.icon = value;
            this.updateGear(7);
        }
        get visibleItemCount() {
            return this._visibleItemCount;
        }
        set visibleItemCount(value) {
            this._visibleItemCount = value;
        }
        get popupDirection() {
            return this._popupDirection;
        }
        set popupDirection(value) {
            this._popupDirection = value;
        }
        get items() {
            return this._items;
        }
        set items(value) {
            if (!value)
                this._items.length = 0;
            else
                this._items = value.concat();
            if (this._items.length > 0) {
                if (this._selectedIndex >= this._items.length)
                    this._selectedIndex = this._items.length - 1;
                else if (this._selectedIndex == -1)
                    this._selectedIndex = 0;
                this.text = this._items[this._selectedIndex];
                if (this._icons != null && this._selectedIndex < this._icons.length)
                    this.icon = this._icons[this._selectedIndex];
            }
            else {
                this.text = "";
                if (this._icons != null)
                    this.icon = null;
                this._selectedIndex = -1;
            }
            this._itemsUpdated = true;
        }
        get icons() {
            return this._icons;
        }
        set icons(value) {
            this._icons = value;
            if (this._icons != null && this._selectedIndex != -1 && this._selectedIndex < this._icons.length)
                this.icon = this._icons[this._selectedIndex];
        }
        get values() {
            return this._values;
        }
        set values(value) {
            if (!value)
                this._values.length = 0;
            else
                this._values = value.concat();
        }
        get selectedIndex() {
            return this._selectedIndex;
        }
        set selectedIndex(val) {
            if (this._selectedIndex == val)
                return;
            this._selectedIndex = val;
            if (this._selectedIndex >= 0 && this._selectedIndex < this._items.length) {
                this.text = this._items[this._selectedIndex];
                if (this._icons != null && this._selectedIndex < this._icons.length)
                    this.icon = this._icons[this._selectedIndex];
            }
            else {
                this.text = "";
                if (this._icons != null)
                    this.icon = null;
            }
            this.updateSelectionController();
        }
        get value() {
            return this._values[this._selectedIndex];
        }
        set value(val) {
            var index = this._values.indexOf(val);
            if (index == -1 && val == null)
                index = this._values.indexOf("");
            this.selectedIndex = index;
        }
        getTextField() {
            if (this._titleObject instanceof fgui.GTextField)
                return this._titleObject;
            else if (this._titleObject instanceof fgui.GLabel)
                return this._titleObject.getTextField();
            else if (this._titleObject instanceof fgui.GButton)
                return this._titleObject.getTextField();
            else
                return null;
        }
        setState(val) {
            if (this._buttonController)
                this._buttonController.selectedPage = val;
        }
        get selectionController() {
            return this._selectionController;
        }
        set selectionController(value) {
            this._selectionController = value;
        }
        handleControllerChanged(c) {
            super.handleControllerChanged(c);
            if (this._selectionController == c)
                this.selectedIndex = c.selectedIndex;
        }
        updateSelectionController() {
            if (this._selectionController != null && !this._selectionController.changing
                && this._selectedIndex < this._selectionController.pageCount) {
                var c = this._selectionController;
                this._selectionController = null;
                c.selectedIndex = this._selectedIndex;
                this._selectionController = c;
            }
        }
        dispose() {
            if (this.dropdown) {
                this.dropdown.dispose();
                this.dropdown = null;
            }
            this._selectionController = null;
            super.dispose();
        }
        getProp(index) {
            switch (index) {
                case fgui.ObjectPropID.Color:
                    return this.titleColor;
                case fgui.ObjectPropID.OutlineColor:
                    {
                        var tf = this.getTextField();
                        if (tf)
                            return tf.strokeColor;
                        else
                            return 0;
                    }
                case fgui.ObjectPropID.FontSize:
                    {
                        tf = this.getTextField();
                        if (tf)
                            return tf.fontSize;
                        else
                            return 0;
                    }
                default:
                    return super.getProp(index);
            }
        }
        setProp(index, value) {
            switch (index) {
                case fgui.ObjectPropID.Color:
                    this.titleColor = value;
                    break;
                case fgui.ObjectPropID.OutlineColor:
                    {
                        var tf = this.getTextField();
                        if (tf)
                            tf.strokeColor = value;
                    }
                    break;
                case fgui.ObjectPropID.FontSize:
                    {
                        tf = this.getTextField();
                        if (tf)
                            tf.fontSize = value;
                    }
                    break;
                default:
                    super.setProp(index, value);
                    break;
            }
        }
        constructExtension(buffer) {
            var str;
            this._buttonController = this.getController("button");
            this._titleObject = this.getChild("title");
            this._iconObject = this.getChild("icon");
            str = buffer.readS();
            if (str) {
                this.dropdown = (fgui.UIPackage.createObjectFromURL(str));
                if (!this.dropdown) {
                    Laya.Log.print("下拉框必须为元件");
                    return;
                }
                this.dropdown.name = "this._dropdownObject";
                this._list = this.dropdown.getChild("list").asList;
                if (this._list == null) {
                    Laya.Log.print(this.resourceURL + ": 下拉框的弹出元件里必须包含名为list的列表");
                    return;
                }
                this._list.on(fgui.Events.CLICK_ITEM, this, this.__clickItem);
                this._list.addRelation(this.dropdown, fgui.RelationType.Width);
                this._list.removeRelation(this.dropdown, fgui.RelationType.Height);
                this.dropdown.addRelation(this._list, fgui.RelationType.Height);
                this.dropdown.removeRelation(this._list, fgui.RelationType.Width);
                this.dropdown.displayObject.on(Laya.Event.UNDISPLAY, this, this.__popupWinClosed);
            }
            this.on(Laya.Event.ROLL_OVER, this, this.__rollover);
            this.on(Laya.Event.ROLL_OUT, this, this.__rollout);
            this.on(Laya.Event.MOUSE_DOWN, this, this.__mousedown);
        }
        setup_afterAdd(buffer, beginPos) {
            super.setup_afterAdd(buffer, beginPos);
            if (!buffer.seek(beginPos, 6))
                return;
            if (buffer.readByte() != this.packageItem.objectType)
                return;
            var i;
            var iv;
            var nextPos;
            var str;
            var itemCount = buffer.getInt16();
            for (i = 0; i < itemCount; i++) {
                nextPos = buffer.getInt16();
                nextPos += buffer.pos;
                this._items[i] = buffer.readS();
                this._values[i] = buffer.readS();
                str = buffer.readS();
                if (str != null) {
                    if (this._icons == null)
                        this._icons = [];
                    this._icons[i] = str;
                }
                buffer.pos = nextPos;
            }
            str = buffer.readS();
            if (str != null) {
                this.text = str;
                this._selectedIndex = this._items.indexOf(str);
            }
            else if (this._items.length > 0) {
                this._selectedIndex = 0;
                this.text = this._items[0];
            }
            else
                this._selectedIndex = -1;
            str = buffer.readS();
            if (str != null)
                this.icon = str;
            if (buffer.readBool())
                this.titleColor = buffer.readColorS();
            iv = buffer.getInt32();
            if (iv > 0)
                this._visibleItemCount = iv;
            this._popupDirection = buffer.readByte();
            iv = buffer.getInt16();
            if (iv >= 0)
                this._selectionController = this.parent.getControllerAt(iv);
        }
        showDropdown() {
            if (this._itemsUpdated) {
                this._itemsUpdated = false;
                this._list.removeChildrenToPool();
                var cnt = this._items.length;
                for (var i = 0; i < cnt; i++) {
                    var item = this._list.addItemFromPool();
                    item.name = i < this._values.length ? this._values[i] : "";
                    item.text = this._items[i];
                    item.icon = (this._icons != null && i < this._icons.length) ? this._icons[i] : null;
                }
                this._list.resizeToFit(this._visibleItemCount);
            }
            this._list.selectedIndex = -1;
            this.dropdown.width = this.width;
            this._list.ensureBoundsCorrect();
            var downward = null;
            if (this._popupDirection == fgui.PopupDirection.Down)
                downward = true;
            else if (this._popupDirection == fgui.PopupDirection.Up)
                downward = false;
            this.root.togglePopup(this.dropdown, this, downward);
            if (this.dropdown.parent)
                this.setState(fgui.GButton.DOWN);
        }
        __popupWinClosed() {
            if (this._over)
                this.setState(fgui.GButton.OVER);
            else
                this.setState(fgui.GButton.UP);
        }
        __clickItem(itemObject, evt) {
            Laya.timer.callLater(this, this.__clickItem2, [this._list.getChildIndex(itemObject), evt]);
        }
        __clickItem2(index, evt) {
            if (this.dropdown.parent instanceof fgui.GRoot)
                this.dropdown.parent.hidePopup();
            this._selectedIndex = -1;
            this.selectedIndex = index;
            fgui.Events.dispatch(fgui.Events.STATE_CHANGED, this.displayObject, evt);
        }
        __rollover() {
            this._over = true;
            if (this._down || this.dropdown && this.dropdown.parent)
                return;
            this.setState(fgui.GButton.OVER);
        }
        __rollout() {
            this._over = false;
            if (this._down || this.dropdown && this.dropdown.parent)
                return;
            this.setState(fgui.GButton.UP);
        }
        __mousedown(evt) {
            if (evt.target instanceof Laya.Input)
                return;
            this._down = true;
            fgui.GRoot.inst.checkPopups(evt.target);
            Laya.stage.on(Laya.Event.MOUSE_UP, this, this.__mouseup);
            if (this.dropdown)
                this.showDropdown();
        }
        __mouseup() {
            if (this._down) {
                this._down = false;
                Laya.stage.off(Laya.Event.MOUSE_UP, this, this.__mouseup);
                if (this.dropdown && !this.dropdown.parent) {
                    if (this._over)
                        this.setState(fgui.GButton.OVER);
                    else
                        this.setState(fgui.GButton.UP);
                }
            }
        }
    }
    fgui.GComboBox = GComboBox;
})(fgui || (fgui = {}));

(function (fgui) {
    class GGraph extends fgui.GObject {
        constructor() {
            super();
            this._type = 0;
            this._lineSize = 1;
            this._lineColor = "#000000";
            this._fillColor = "#FFFFFF";
            this._cornerRadius = null;
            this._sides = 3;
            this._startAngle = 0;
        }
        drawRect(lineSize, lineColor, fillColor, cornerRadius = null) {
            this._type = 1;
            this._lineSize = lineSize;
            this._lineColor = lineColor;
            this._fillColor = fillColor;
            this._cornerRadius = cornerRadius;
            this.updateGraph();
        }
        drawEllipse(lineSize, lineColor, fillColor) {
            this._type = 2;
            this._lineSize = lineSize;
            this._lineColor = lineColor;
            this._fillColor = fillColor;
            this.updateGraph();
        }
        drawRegularPolygon(lineSize, lineColor, fillColor, sides, startAngle = 0, distances = null) {
            this._type = 3;
            this._lineSize = lineSize;
            this._lineColor = lineColor;
            this._fillColor = fillColor;
            this._sides = sides;
            this._startAngle = startAngle;
            this._distances = distances;
            this.updateGraph();
        }
        drawPolygon(lineSize, lineColor, fillColor, points) {
            this._type = 4;
            this._lineSize = lineSize;
            this._lineColor = lineColor;
            this._fillColor = fillColor;
            this._polygonPoints = points;
            this.updateGraph();
        }
        get distances() {
            return this._distances;
        }
        set distances(value) {
            this._distances = value;
            if (this._type == 3)
                this.updateGraph();
        }
        get color() {
            return this._fillColor;
        }
        set color(value) {
            this._fillColor = value;
            if (this._type != 0)
                this.updateGraph();
        }
        updateGraph() {
            this._displayObject.mouseEnabled = this.touchable;
            var gr = this._displayObject.graphics;
            gr.clear();
            var w = this.width;
            var h = this.height;
            if (w == 0 || h == 0)
                return;
            var fillColor = this._fillColor;
            var lineColor = this._lineColor;
            if (fgui.ToolSet.startsWith(fillColor, "rgba")) {
                var arr = fillColor.substring(5, fillColor.lastIndexOf(")")).split(",");
                var a = parseFloat(arr[3]);
                if (a == 0)
                    fillColor = null;
                else {
                    fillColor = Laya.Utils.toHexColor((parseInt(arr[0]) << 16) + (parseInt(arr[1]) << 8) + parseInt(arr[2]));
                    this.alpha = a;
                }
            }
            if (this._type == 1) {
                if (this._cornerRadius != null) {
                    var paths = [
                        ["moveTo", this._cornerRadius[0], 0],
                        ["lineTo", w - this._cornerRadius[1], 0],
                        ["arcTo", w, 0, w, this._cornerRadius[1], this._cornerRadius[1]],
                        ["lineTo", w, h - this._cornerRadius[3]],
                        ["arcTo", w, h, w - this._cornerRadius[3], h, this._cornerRadius[3]],
                        ["lineTo", this._cornerRadius[2], h],
                        ["arcTo", 0, h, 0, h - this._cornerRadius[2], this._cornerRadius[2]],
                        ["lineTo", 0, this._cornerRadius[0]],
                        ["arcTo", 0, 0, this._cornerRadius[0], 0, this._cornerRadius[0]],
                        ["closePath"]
                    ];
                    gr.drawPath(0, 0, paths, { fillStyle: fillColor }, this._lineSize > 0 ? { strokeStyle: lineColor, lineWidth: this._lineSize } : null);
                }
                else
                    gr.drawRect(0, 0, w, h, fillColor, this._lineSize > 0 ? lineColor : null, this._lineSize);
            }
            else if (this._type == 2) {
                gr.drawCircle(w / 2, h / 2, w / 2, fillColor, this._lineSize > 0 ? lineColor : null, this._lineSize);
            }
            else if (this._type == 3) {
                gr.drawPoly(0, 0, this._polygonPoints, fillColor, this._lineSize > 0 ? lineColor : null, this._lineSize);
            }
            else if (this._type == 4) {
                if (!this._polygonPoints)
                    this._polygonPoints = [];
                var radius = Math.min(this._width, this._height) / 2;
                this._polygonPoints.length = 0;
                var angle = Laya.Utils.toRadian(this._startAngle);
                var deltaAngle = 2 * Math.PI / this._sides;
                var dist;
                for (var i = 0; i < this._sides; i++) {
                    if (this._distances) {
                        dist = this._distances[i];
                        if (isNaN(dist))
                            dist = 1;
                    }
                    else
                        dist = 1;
                    var xv = radius + radius * dist * Math.cos(angle);
                    var yv = radius + radius * dist * Math.sin(angle);
                    this._polygonPoints.push(xv, yv);
                    angle += deltaAngle;
                }
                gr.drawPoly(0, 0, this._polygonPoints, fillColor, this._lineSize > 0 ? lineColor : null, this._lineSize);
            }
            this._displayObject.repaint();
        }
        replaceMe(target) {
            if (!this._parent)
                throw "parent not set";
            target.name = this.name;
            target.alpha = this.alpha;
            target.rotation = this.rotation;
            target.visible = this.visible;
            target.touchable = this.touchable;
            target.grayed = this.grayed;
            target.setXY(this.x, this.y);
            target.setSize(this.width, this.height);
            var index = this._parent.getChildIndex(this);
            this._parent.addChildAt(target, index);
            target.relations.copyFrom(this.relations);
            this._parent.removeChild(this, true);
        }
        addBeforeMe(target) {
            if (this._parent == null)
                throw "parent not set";
            var index = this._parent.getChildIndex(this);
            this._parent.addChildAt(target, index);
        }
        addAfterMe(target) {
            if (this._parent == null)
                throw "parent not set";
            var index = this._parent.getChildIndex(this);
            index++;
            this._parent.addChildAt(target, index);
        }
        setNativeObject(obj) {
            this._type = 0;
            this._displayObject.mouseEnabled = this.touchable;
            this._displayObject.graphics.clear();
            this._displayObject.addChild(obj);
        }
        createDisplayObject() {
            super.createDisplayObject();
            this._displayObject.mouseEnabled = false;
            this._hitArea = new Laya.HitArea();
            this._hitArea.hit = this._displayObject.graphics;
            this._displayObject.hitArea = this._hitArea;
        }
        getProp(index) {
            if (index == fgui.ObjectPropID.Color)
                return this.color;
            else
                return super.getProp(index);
        }
        setProp(index, value) {
            if (index == fgui.ObjectPropID.Color)
                this.color = value;
            else
                super.setProp(index, value);
        }
        handleSizeChanged() {
            super.handleSizeChanged();
            if (this._type != 0)
                this.updateGraph();
        }
        setup_beforeAdd(buffer, beginPos) {
            super.setup_beforeAdd(buffer, beginPos);
            buffer.seek(beginPos, 5);
            this._type = buffer.readByte();
            if (this._type != 0) {
                var i;
                var cnt;
                this._lineSize = buffer.getInt32();
                this._lineColor = buffer.readColorS(true);
                this._fillColor = buffer.readColorS(true);
                if (buffer.readBool()) {
                    this._cornerRadius = [];
                    for (i = 0; i < 4; i++)
                        this._cornerRadius[i] = buffer.getFloat32();
                }
                if (this._type == 3) {
                    cnt = buffer.getInt16();
                    this._polygonPoints = [];
                    this._polygonPoints.length = cnt;
                    for (i = 0; i < cnt; i++)
                        this._polygonPoints[i] = buffer.getFloat32();
                }
                else if (this._type == 4) {
                    this._sides = buffer.getInt16();
                    this._startAngle = buffer.getFloat32();
                    cnt = buffer.getInt16();
                    if (cnt > 0) {
                        this._distances = [];
                        for (i = 0; i < cnt; i++)
                            this._distances[i] = buffer.getFloat32();
                    }
                }
                this.updateGraph();
            }
        }
    }
    fgui.GGraph = GGraph;
})(fgui || (fgui = {}));

(function (fgui) {
    class GGroup extends fgui.GObject {
        constructor() {
            super();
            this._layout = 0;
            this._lineGap = 0;
            this._columnGap = 0;
            this._mainGridIndex = -1;
            this._mainGridMinSize = 50;
            this._mainChildIndex = -1;
            this._totalSize = 0;
            this._numChildren = 0;
            this._updating = 0;
        }
        dispose() {
            this._boundsChanged = false;
            super.dispose();
        }
        get layout() {
            return this._layout;
        }
        set layout(value) {
            if (this._layout != value) {
                this._layout = value;
                this.setBoundsChangedFlag();
            }
        }
        get lineGap() {
            return this._lineGap;
        }
        set lineGap(value) {
            if (this._lineGap != value) {
                this._lineGap = value;
                this.setBoundsChangedFlag(true);
            }
        }
        get columnGap() {
            return this._columnGap;
        }
        set columnGap(value) {
            if (this._columnGap != value) {
                this._columnGap = value;
                this.setBoundsChangedFlag(true);
            }
        }
        get excludeInvisibles() {
            return this._excludeInvisibles;
        }
        set excludeInvisibles(value) {
            if (this._excludeInvisibles != value) {
                this._excludeInvisibles = value;
                this.setBoundsChangedFlag();
            }
        }
        get autoSizeDisabled() {
            return this._autoSizeDisabled;
        }
        set autoSizeDisabled(value) {
            this._autoSizeDisabled = value;
        }
        get mainGridMinSize() {
            return this._mainGridMinSize;
        }
        set mainGridMinSize(value) {
            if (this._mainGridMinSize != value) {
                this._mainGridMinSize = value;
                this.setBoundsChangedFlag();
            }
        }
        get mainGridIndex() {
            return this._mainGridIndex;
        }
        set mainGridIndex(value) {
            if (this._mainGridIndex != value) {
                this._mainGridIndex = value;
                this.setBoundsChangedFlag();
            }
        }
        setBoundsChangedFlag(positionChangedOnly = false) {
            if (this._updating == 0 && this._parent != null) {
                if (!positionChangedOnly)
                    this._percentReady = false;
                if (!this._boundsChanged) {
                    this._boundsChanged = true;
                    if (this._layout != fgui.GroupLayoutType.None)
                        Laya.timer.callLater(this, this.ensureBoundsCorrect);
                }
            }
        }
        ensureSizeCorrect() {
            if (this._parent == null || !this._boundsChanged || this._layout == 0)
                return;
            this._boundsChanged = false;
            if (this._autoSizeDisabled)
                this.resizeChildren(0, 0);
            else {
                this.handleLayout();
                this.updateBounds();
            }
        }
        ensureBoundsCorrect() {
            if (this._parent == null || !this._boundsChanged)
                return;
            this._boundsChanged = false;
            if (this._layout == 0)
                this.updateBounds();
            else {
                if (this._autoSizeDisabled)
                    this.resizeChildren(0, 0);
                else {
                    this.handleLayout();
                    this.updateBounds();
                }
            }
        }
        updateBounds() {
            Laya.timer.clear(this, this.ensureBoundsCorrect);
            var cnt = this._parent.numChildren;
            var i;
            var child;
            var ax = Number.POSITIVE_INFINITY, ay = Number.POSITIVE_INFINITY;
            var ar = Number.NEGATIVE_INFINITY, ab = Number.NEGATIVE_INFINITY;
            var tmp;
            var empty = true;
            for (i = 0; i < cnt; i++) {
                child = this._parent.getChildAt(i);
                if (child.group != this || this._excludeInvisibles && !child.internalVisible3)
                    continue;
                tmp = child.xMin;
                if (tmp < ax)
                    ax = tmp;
                tmp = child.yMin;
                if (tmp < ay)
                    ay = tmp;
                tmp = child.xMin + child.width;
                if (tmp > ar)
                    ar = tmp;
                tmp = child.yMin + child.height;
                if (tmp > ab)
                    ab = tmp;
                empty = false;
            }
            var w = 0, h = 0;
            if (!empty) {
                this._updating |= 1;
                this.setXY(ax, ay);
                this._updating &= 2;
                w = ar - ax;
                h = ab - ay;
            }
            if ((this._updating & 2) == 0) {
                this._updating |= 2;
                this.setSize(w, h);
                this._updating &= 1;
            }
            else {
                this._updating &= 1;
                this.resizeChildren(this._width - w, this._height - h);
            }
        }
        handleLayout() {
            this._updating |= 1;
            var child;
            var i;
            var cnt;
            if (this._layout == fgui.GroupLayoutType.Horizontal) {
                var curX = this.x;
                cnt = this._parent.numChildren;
                for (i = 0; i < cnt; i++) {
                    child = this._parent.getChildAt(i);
                    if (child.group != this)
                        continue;
                    if (this._excludeInvisibles && !child.internalVisible3)
                        continue;
                    child.xMin = curX;
                    if (child.width != 0)
                        curX += child.width + this._columnGap;
                }
            }
            else if (this._layout == fgui.GroupLayoutType.Vertical) {
                var curY = this.y;
                cnt = this._parent.numChildren;
                for (i = 0; i < cnt; i++) {
                    child = this._parent.getChildAt(i);
                    if (child.group != this)
                        continue;
                    if (this._excludeInvisibles && !child.internalVisible3)
                        continue;
                    child.yMin = curY;
                    if (child.height != 0)
                        curY += child.height + this._lineGap;
                }
            }
            this._updating &= 2;
        }
        moveChildren(dx, dy) {
            if ((this._updating & 1) != 0 || this._parent == null)
                return;
            this._updating |= 1;
            var cnt = this._parent.numChildren;
            var i;
            var child;
            for (i = 0; i < cnt; i++) {
                child = this._parent.getChildAt(i);
                if (child.group == this) {
                    child.setXY(child.x + dx, child.y + dy);
                }
            }
            this._updating &= 2;
        }
        resizeChildren(dw, dh) {
            if (this._layout == fgui.GroupLayoutType.None || (this._updating & 2) != 0 || this._parent == null)
                return;
            this._updating |= 2;
            if (this._boundsChanged) {
                this._boundsChanged = false;
                if (!this._autoSizeDisabled) {
                    this.updateBounds();
                    return;
                }
            }
            var cnt = this._parent.numChildren;
            var i;
            var child;
            if (!this._percentReady) {
                this._percentReady = true;
                this._numChildren = 0;
                this._totalSize = 0;
                this._mainChildIndex = -1;
                var j = 0;
                for (i = 0; i < cnt; i++) {
                    child = this._parent.getChildAt(i);
                    if (child.group != this)
                        continue;
                    if (!this._excludeInvisibles || child.internalVisible3) {
                        if (j == this._mainGridIndex)
                            this._mainChildIndex = i;
                        this._numChildren++;
                        if (this._layout == 1)
                            this._totalSize += child.width;
                        else
                            this._totalSize += child.height;
                    }
                    j++;
                }
                if (this._mainChildIndex != -1) {
                    if (this._layout == 1) {
                        child = this._parent.getChildAt(this._mainChildIndex);
                        this._totalSize += this._mainGridMinSize - child.width;
                        child._sizePercentInGroup = this._mainGridMinSize / this._totalSize;
                    }
                    else {
                        child = this._parent.getChildAt(this._mainChildIndex);
                        this._totalSize += this._mainGridMinSize - child.height;
                        child._sizePercentInGroup = this._mainGridMinSize / this._totalSize;
                    }
                }
                for (i = 0; i < cnt; i++) {
                    child = this._parent.getChildAt(i);
                    if (child.group != this)
                        continue;
                    if (i == this._mainChildIndex)
                        continue;
                    if (this._totalSize > 0)
                        child._sizePercentInGroup = (this._layout == 1 ? child.width : child.height) / this._totalSize;
                    else
                        child._sizePercentInGroup = 0;
                }
            }
            var remainSize = 0;
            var remainPercent = 1;
            var priorHandled = false;
            if (this._layout == 1) {
                remainSize = this.width - (this._numChildren - 1) * this._columnGap;
                if (this._mainChildIndex != -1 && remainSize >= this._totalSize) {
                    child = this._parent.getChildAt(this._mainChildIndex);
                    child.setSize(remainSize - (this._totalSize - this._mainGridMinSize), child._rawHeight + dh, true);
                    remainSize -= child.width;
                    remainPercent -= child._sizePercentInGroup;
                    priorHandled = true;
                }
                var curX = this.x;
                for (i = 0; i < cnt; i++) {
                    child = this._parent.getChildAt(i);
                    if (child.group != this)
                        continue;
                    if (this._excludeInvisibles && !child.internalVisible3) {
                        child.setSize(child._rawWidth, child._rawHeight + dh, true);
                        continue;
                    }
                    if (!priorHandled || i != this._mainChildIndex) {
                        child.setSize(Math.round(child._sizePercentInGroup / remainPercent * remainSize), child._rawHeight + dh, true);
                        remainPercent -= child._sizePercentInGroup;
                        remainSize -= child.width;
                    }
                    child.xMin = curX;
                    if (child.width != 0)
                        curX += child.width + this._columnGap;
                }
            }
            else {
                remainSize = this.height - (this._numChildren - 1) * this._lineGap;
                if (this._mainChildIndex != -1 && remainSize >= this._totalSize) {
                    child = this._parent.getChildAt(this._mainChildIndex);
                    child.setSize(child._rawWidth + dw, remainSize - (this._totalSize - this._mainGridMinSize), true);
                    remainSize -= child.height;
                    remainPercent -= child._sizePercentInGroup;
                    priorHandled = true;
                }
                var curY = this.y;
                for (i = 0; i < cnt; i++) {
                    child = this._parent.getChildAt(i);
                    if (child.group != this)
                        continue;
                    if (this._excludeInvisibles && !child.internalVisible3) {
                        child.setSize(child._rawWidth + dw, child._rawHeight, true);
                        continue;
                    }
                    if (!priorHandled || i != this._mainChildIndex) {
                        child.setSize(child._rawWidth + dw, Math.round(child._sizePercentInGroup / remainPercent * remainSize), true);
                        remainPercent -= child._sizePercentInGroup;
                        remainSize -= child.height;
                    }
                    child.yMin = curY;
                    if (child.height != 0)
                        curY += child.height + this._lineGap;
                }
            }
            this._updating &= 1;
        }
        handleAlphaChanged() {
            if (this._underConstruct)
                return;
            var cnt = this._parent.numChildren;
            for (var i = 0; i < cnt; i++) {
                var child = this._parent.getChildAt(i);
                if (child.group == this)
                    child.alpha = this.alpha;
            }
        }
        handleVisibleChanged() {
            if (!this._parent)
                return;
            var cnt = this._parent.numChildren;
            for (var i = 0; i < cnt; i++) {
                var child = this._parent.getChildAt(i);
                if (child.group == this)
                    child.handleVisibleChanged();
            }
        }
        setup_beforeAdd(buffer, beginPos) {
            super.setup_beforeAdd(buffer, beginPos);
            buffer.seek(beginPos, 5);
            this._layout = buffer.readByte();
            this._lineGap = buffer.getInt32();
            this._columnGap = buffer.getInt32();
            if (buffer.version >= 2) {
                this._excludeInvisibles = buffer.readBool();
                this._autoSizeDisabled = buffer.readBool();
                this._mainChildIndex = buffer.getInt16();
            }
        }
        setup_afterAdd(buffer, beginPos) {
            super.setup_afterAdd(buffer, beginPos);
            if (!this.visible)
                this.handleVisibleChanged();
        }
    }
    fgui.GGroup = GGroup;
})(fgui || (fgui = {}));

(function (fgui) {
    class GImage extends fgui.GObject {
        constructor() {
            super();
            this._flip = 0;
        }
        get image() {
            return this._image;
        }
        get color() {
            return this.image.color;
        }
        set color(value) {
            if (this.image.color != value) {
                this.image.color = value;
                this.updateGear(4);
            }
        }
        get flip() {
            return this._flip;
        }
        set flip(value) {
            if (this._flip != value) {
                this._flip = value;
                var sx = 1, sy = 1;
                if (this._flip == fgui.FlipType.Horizontal || this._flip == fgui.FlipType.Both)
                    sx = -1;
                if (this._flip == fgui.FlipType.Vertical || this._flip == fgui.FlipType.Both)
                    sy = -1;
                this.setScale(sx, sy);
                this.handleXYChanged();
            }
        }
        get fillMethod() {
            return this.image.fillMethod;
        }
        set fillMethod(value) {
            this.image.fillMethod = value;
        }
        get fillOrigin() {
            return this.image.fillOrigin;
        }
        set fillOrigin(value) {
            this.image.fillOrigin = value;
        }
        get fillClockwise() {
            return this.image.fillClockwise;
        }
        set fillClockwise(value) {
            this.image.fillClockwise = value;
        }
        get fillAmount() {
            return this.image.fillAmount;
        }
        set fillAmount(value) {
            this.image.fillAmount = value;
        }
        createDisplayObject() {
            this._displayObject = this._image = new fgui.Image();
            this.image.mouseEnabled = false;
            this._displayObject["$owner"] = this;
        }
        constructFromResource() {
            this._contentItem = this.packageItem.getBranch();
            this.sourceWidth = this._contentItem.width;
            this.sourceHeight = this._contentItem.height;
            this.initWidth = this.sourceWidth;
            this.initHeight = this.sourceHeight;
            this._contentItem = this._contentItem.getHighResolution();
            this._contentItem.load();
            this.image.scale9Grid = this._contentItem.scale9Grid;
            this.image.scaleByTile = this._contentItem.scaleByTile;
            this.image.tileGridIndice = this._contentItem.tileGridIndice;
            this.image.texture = this._contentItem.texture;
            this.setSize(this.sourceWidth, this.sourceHeight);
        }
        handleXYChanged() {
            super.handleXYChanged();
            if (this._flip != fgui.FlipType.None) {
                if (this.scaleX == -1)
                    this.image.x += this.width;
                if (this.scaleY == -1)
                    this.image.y += this.height;
            }
        }
        getProp(index) {
            if (index == fgui.ObjectPropID.Color)
                return this.color;
            else
                return super.getProp(index);
        }
        setProp(index, value) {
            if (index == fgui.ObjectPropID.Color)
                this.color = value;
            else
                super.setProp(index, value);
        }
        setup_beforeAdd(buffer, beginPos) {
            super.setup_beforeAdd(buffer, beginPos);
            buffer.seek(beginPos, 5);
            if (buffer.readBool())
                this.color = buffer.readColorS();
            this.flip = buffer.readByte();
            this.image.fillMethod = buffer.readByte();
            if (this.image.fillMethod != 0) {
                this.image.fillOrigin = buffer.readByte();
                this.image.fillClockwise = buffer.readBool();
                this.image.fillAmount = buffer.getFloat32();
            }
        }
    }
    fgui.GImage = GImage;
})(fgui || (fgui = {}));

(function (fgui) {
    class GLabel extends fgui.GComponent {
        constructor() {
            super();
        }
        get icon() {
            if (this._iconObject != null)
                return this._iconObject.icon;
            else
                return null;
        }
        set icon(value) {
            if (this._iconObject != null)
                this._iconObject.icon = value;
            this.updateGear(7);
        }
        get title() {
            if (this._titleObject)
                return this._titleObject.text;
            else
                return null;
        }
        set title(value) {
            if (this._titleObject)
                this._titleObject.text = value;
            this.updateGear(6);
        }
        get text() {
            return this.title;
        }
        set text(value) {
            this.title = value;
        }
        get titleColor() {
            var tf = this.getTextField();
            if (tf != null)
                return tf.color;
            else
                return "#000000";
        }
        set titleColor(value) {
            var tf = this.getTextField();
            if (tf != null)
                tf.color = value;
            this.updateGear(4);
        }
        get titleFontSize() {
            var tf = this.getTextField();
            if (tf != null)
                return tf.fontSize;
            else
                return 0;
        }
        set titleFontSize(value) {
            var tf = this.getTextField();
            if (tf != null)
                tf.fontSize = value;
        }
        get color() {
            return this.titleColor;
        }
        set color(value) {
            this.titleColor = value;
        }
        set editable(val) {
            if (this._titleObject)
                this._titleObject.asTextInput.editable = val;
        }
        get editable() {
            if (this._titleObject && (this._titleObject instanceof fgui.GTextInput))
                return this._titleObject.asTextInput.editable;
            else
                return false;
        }
        getTextField() {
            if (this._titleObject instanceof fgui.GTextField)
                return this._titleObject;
            else if (this._titleObject instanceof GLabel)
                return (this._titleObject).getTextField();
            else if (this._titleObject instanceof fgui.GButton)
                return this._titleObject.getTextField();
            else
                return null;
        }
        getProp(index) {
            switch (index) {
                case fgui.ObjectPropID.Color:
                    return this.titleColor;
                case fgui.ObjectPropID.OutlineColor:
                    {
                        var tf = this.getTextField();
                        if (tf)
                            return tf.strokeColor;
                        else
                            return 0;
                    }
                case fgui.ObjectPropID.FontSize:
                    return this.titleFontSize;
                default:
                    return super.getProp(index);
            }
        }
        setProp(index, value) {
            switch (index) {
                case fgui.ObjectPropID.Color:
                    this.titleColor = value;
                    break;
                case fgui.ObjectPropID.OutlineColor:
                    {
                        var tf = this.getTextField();
                        if (tf)
                            tf.strokeColor = value;
                    }
                    break;
                case fgui.ObjectPropID.FontSize:
                    this.titleFontSize = value;
                    break;
                default:
                    super.setProp(index, value);
                    break;
            }
        }
        constructExtension(buffer) {
            this._titleObject = this.getChild("title");
            this._iconObject = this.getChild("icon");
        }
        setup_afterAdd(buffer, beginPos) {
            super.setup_afterAdd(buffer, beginPos);
            if (!buffer.seek(beginPos, 6))
                return;
            if (buffer.readByte() != this.packageItem.objectType)
                return;
            var str;
            str = buffer.readS();
            if (str != null)
                this.title = str;
            str = buffer.readS();
            if (str != null)
                this.icon = str;
            if (buffer.readBool())
                this.titleColor = buffer.readColorS();
            var iv = buffer.getInt32();
            if (iv != 0)
                this.titleFontSize = iv;
            if (buffer.readBool()) {
                var input = this.getTextField();
                if (input != null) {
                    str = buffer.readS();
                    if (str != null)
                        input.promptText = str;
                    str = buffer.readS();
                    if (str != null)
                        input.restrict = str;
                    iv = buffer.getInt32();
                    if (iv != 0)
                        input.maxLength = iv;
                    iv = buffer.getInt32();
                    if (iv != 0) {
                        if (iv == 4)
                            input.keyboardType = Laya.Input.TYPE_NUMBER;
                        else if (iv == 3)
                            input.keyboardType = Laya.Input.TYPE_URL;
                    }
                    if (buffer.readBool())
                        input.password = true;
                }
                else
                    buffer.skip(13);
            }
        }
    }
    fgui.GLabel = GLabel;
})(fgui || (fgui = {}));

(function (fgui) {
    class GList extends fgui.GComponent {
        constructor() {
            super();
            this._lineCount = 0;
            this._columnCount = 0;
            this._lineGap = 0;
            this._columnGap = 0;
            this._lastSelectedIndex = 0;
            this._numItems = 0;
            this._firstIndex = 0;
            this._curLineItemCount = 0;
            this._virtualListChanged = 0;
            this.itemInfoVer = 0;
            this._trackBounds = true;
            this._pool = new fgui.GObjectPool();
            this._layout = fgui.ListLayoutType.SingleColumn;
            this._autoResizeItem = true;
            this._lastSelectedIndex = -1;
            this._selectionMode = fgui.ListSelectionMode.Single;
            this.opaque = true;
            this.scrollItemToViewOnClick = true;
            this._align = "left";
            this._verticalAlign = "top";
            this._container = new Laya.Sprite();
            this._displayObject.addChild(this._container);
        }
        dispose() {
            this._pool.clear();
            super.dispose();
        }
        get layout() {
            return this._layout;
        }
        set layout(value) {
            if (this._layout != value) {
                this._layout = value;
                this.setBoundsChangedFlag();
                if (this._virtual)
                    this.setVirtualListChangedFlag(true);
            }
        }
        get lineCount() {
            return this._lineCount;
        }
        set lineCount(value) {
            if (this._lineCount != value) {
                this._lineCount = value;
                if (this._layout == fgui.ListLayoutType.FlowVertical || this._layout == fgui.ListLayoutType.Pagination) {
                    this.setBoundsChangedFlag();
                    if (this._virtual)
                        this.setVirtualListChangedFlag(true);
                }
            }
        }
        get columnCount() {
            return this._columnCount;
        }
        set columnCount(value) {
            if (this._columnCount != value) {
                this._columnCount = value;
                if (this._layout == fgui.ListLayoutType.FlowHorizontal || this._layout == fgui.ListLayoutType.Pagination) {
                    this.setBoundsChangedFlag();
                    if (this._virtual)
                        this.setVirtualListChangedFlag(true);
                }
            }
        }
        get lineGap() {
            return this._lineGap;
        }
        set lineGap(value) {
            if (this._lineGap != value) {
                this._lineGap = value;
                this.setBoundsChangedFlag();
                if (this._virtual)
                    this.setVirtualListChangedFlag(true);
            }
        }
        get columnGap() {
            return this._columnGap;
        }
        set columnGap(value) {
            if (this._columnGap != value) {
                this._columnGap = value;
                this.setBoundsChangedFlag();
                if (this._virtual)
                    this.setVirtualListChangedFlag(true);
            }
        }
        get align() {
            return this._align;
        }
        set align(value) {
            if (this._align != value) {
                this._align = value;
                this.setBoundsChangedFlag();
                if (this._virtual)
                    this.setVirtualListChangedFlag(true);
            }
        }
        get verticalAlign() {
            return this._verticalAlign;
        }
        set verticalAlign(value) {
            if (this._verticalAlign != value) {
                this._verticalAlign = value;
                this.setBoundsChangedFlag();
                if (this._virtual)
                    this.setVirtualListChangedFlag(true);
            }
        }
        get virtualItemSize() {
            return this._itemSize;
        }
        set virtualItemSize(value) {
            if (this._virtual) {
                if (this._itemSize == null)
                    this._itemSize = new Laya.Point();
                this._itemSize.setTo(value.x, value.y);
                this.setVirtualListChangedFlag(true);
            }
        }
        get defaultItem() {
            return this._defaultItem;
        }
        set defaultItem(val) {
            this._defaultItem = val;
        }
        get autoResizeItem() {
            return this._autoResizeItem;
        }
        set autoResizeItem(value) {
            if (this._autoResizeItem != value) {
                this._autoResizeItem = value;
                this.setBoundsChangedFlag();
                if (this._virtual)
                    this.setVirtualListChangedFlag(true);
            }
        }
        get selectionMode() {
            return this._selectionMode;
        }
        set selectionMode(value) {
            this._selectionMode = value;
        }
        get selectionController() {
            return this._selectionController;
        }
        set selectionController(value) {
            this._selectionController = value;
        }
        get itemPool() {
            return this._pool;
        }
        getFromPool(url) {
            if (!url)
                url = this._defaultItem;
            var obj = this._pool.getObject(url);
            if (obj != null)
                obj.visible = true;
            return obj;
        }
        returnToPool(obj) {
            obj.displayObject.cacheAs = "none";
            this._pool.returnObject(obj);
        }
        addChildAt(child, index) {
            super.addChildAt(child, index);
            if (child instanceof fgui.GButton) {
                var button = (child);
                button.selected = false;
                button.changeStateOnClick = false;
            }
            child.on(Laya.Event.CLICK, this, this.__clickItem);
            return child;
        }
        addItem(url) {
            if (!url)
                url = this._defaultItem;
            return this.addChild(fgui.UIPackage.createObjectFromURL(url));
        }
        addItemFromPool(url) {
            return this.addChild(this.getFromPool(url));
        }
        removeChildAt(index, dispose) {
            var child = super.removeChildAt(index);
            if (dispose)
                child.dispose();
            else
                child.off(Laya.Event.CLICK, this, this.__clickItem);
            return child;
        }
        removeChildToPoolAt(index) {
            var child = super.removeChildAt(index);
            this.returnToPool(child);
        }
        removeChildToPool(child) {
            super.removeChild(child);
            this.returnToPool(child);
        }
        removeChildrenToPool(beginIndex = 0, endIndex = -1) {
            if (endIndex < 0 || endIndex >= this._children.length)
                endIndex = this._children.length - 1;
            for (var i = beginIndex; i <= endIndex; ++i)
                this.removeChildToPoolAt(beginIndex);
        }
        get selectedIndex() {
            var i;
            if (this._virtual) {
                for (i = 0; i < this._realNumItems; i++) {
                    var ii = this._virtualItems[i];
                    if ((ii.obj instanceof fgui.GButton) && ii.obj.selected
                        || ii.obj == null && ii.selected) {
                        if (this._loop)
                            return i % this._numItems;
                        else
                            return i;
                    }
                }
            }
            else {
                var cnt = this._children.length;
                for (i = 0; i < cnt; i++) {
                    var obj = this._children[i].asButton;
                    if (obj != null && obj.selected)
                        return i;
                }
            }
            return -1;
        }
        set selectedIndex(value) {
            if (value >= 0 && value < this.numItems) {
                if (this._selectionMode != fgui.ListSelectionMode.Single)
                    this.clearSelection();
                this.addSelection(value);
            }
            else
                this.clearSelection();
        }
        getSelection(result) {
            if (!result)
                result = new Array();
            var i;
            if (this._virtual) {
                for (i = 0; i < this._realNumItems; i++) {
                    var ii = this._virtualItems[i];
                    if ((ii.obj instanceof fgui.GButton) && ii.obj.selected
                        || ii.obj == null && ii.selected) {
                        var j = i;
                        if (this._loop) {
                            j = i % this._numItems;
                            if (result.indexOf(j) != -1)
                                continue;
                        }
                        result.push(j);
                    }
                }
            }
            else {
                var cnt = this._children.length;
                for (i = 0; i < cnt; i++) {
                    var obj = this._children[i].asButton;
                    if (obj != null && obj.selected)
                        result.push(i);
                }
            }
            return result;
        }
        addSelection(index, scrollItToView) {
            if (this._selectionMode == fgui.ListSelectionMode.None)
                return;
            this.checkVirtualList();
            if (this._selectionMode == fgui.ListSelectionMode.Single)
                this.clearSelection();
            if (scrollItToView)
                this.scrollToView(index);
            this._lastSelectedIndex = index;
            var obj = null;
            if (this._virtual) {
                var ii = this._virtualItems[index];
                if (ii.obj != null)
                    obj = ii.obj.asButton;
                ii.selected = true;
            }
            else
                obj = this.getChildAt(index).asButton;
            if (obj != null && !obj.selected) {
                obj.selected = true;
                this.updateSelectionController(index);
            }
        }
        removeSelection(index) {
            if (this._selectionMode == fgui.ListSelectionMode.None)
                return;
            var obj = null;
            if (this._virtual) {
                var ii = this._virtualItems[index];
                if (ii.obj != null)
                    obj = ii.obj.asButton;
                ii.selected = false;
            }
            else
                obj = this.getChildAt(index).asButton;
            if (obj != null)
                obj.selected = false;
        }
        clearSelection() {
            var i;
            if (this._virtual) {
                for (i = 0; i < this._realNumItems; i++) {
                    var ii = this._virtualItems[i];
                    if (ii.obj instanceof fgui.GButton)
                        ii.obj.selected = false;
                    ii.selected = false;
                }
            }
            else {
                var cnt = this._children.length;
                for (i = 0; i < cnt; i++) {
                    var obj = this._children[i].asButton;
                    if (obj != null)
                        obj.selected = false;
                }
            }
        }
        clearSelectionExcept(g) {
            var i;
            if (this._virtual) {
                for (i = 0; i < this._realNumItems; i++) {
                    var ii = this._virtualItems[i];
                    if (ii.obj != g) {
                        if ((ii.obj instanceof fgui.GButton))
                            ii.obj.selected = false;
                        ii.selected = false;
                    }
                }
            }
            else {
                var cnt = this._children.length;
                for (i = 0; i < cnt; i++) {
                    var obj = this._children[i].asButton;
                    if (obj != null && obj != g)
                        obj.selected = false;
                }
            }
        }
        selectAll() {
            this.checkVirtualList();
            var last = -1;
            var i;
            if (this._virtual) {
                for (i = 0; i < this._realNumItems; i++) {
                    var ii = this._virtualItems[i];
                    if ((ii.obj instanceof fgui.GButton) && !ii.obj.selected) {
                        ii.obj.selected = true;
                        last = i;
                    }
                    ii.selected = true;
                }
            }
            else {
                var cnt = this._children.length;
                for (i = 0; i < cnt; i++) {
                    var obj = this._children[i].asButton;
                    if (obj != null && !obj.selected) {
                        obj.selected = true;
                        last = i;
                    }
                }
            }
            if (last != -1)
                this.updateSelectionController(last);
        }
        selectNone() {
            this.clearSelection();
        }
        selectReverse() {
            this.checkVirtualList();
            var last = -1;
            var i;
            if (this._virtual) {
                for (i = 0; i < this._realNumItems; i++) {
                    var ii = this._virtualItems[i];
                    if (ii.obj instanceof fgui.GButton) {
                        ii.obj.selected = !ii.obj.selected;
                        if (ii.obj.selected)
                            last = i;
                    }
                    ii.selected = !ii.selected;
                }
            }
            else {
                var cnt = this._children.length;
                for (i = 0; i < cnt; i++) {
                    var obj = this._children[i].asButton;
                    if (obj != null) {
                        obj.selected = !obj.selected;
                        if (obj.selected)
                            last = i;
                    }
                }
            }
            if (last != -1)
                this.updateSelectionController(last);
        }
        handleArrowKey(dir) {
            var index = this.selectedIndex;
            if (index == -1)
                return;
            switch (dir) {
                case 1:
                    if (this._layout == fgui.ListLayoutType.SingleColumn || this._layout == fgui.ListLayoutType.FlowVertical) {
                        index--;
                        if (index >= 0) {
                            this.clearSelection();
                            this.addSelection(index, true);
                        }
                    }
                    else if (this._layout == fgui.ListLayoutType.FlowHorizontal || this._layout == fgui.ListLayoutType.Pagination) {
                        var current = this._children[index];
                        var k = 0;
                        for (var i = index - 1; i >= 0; i--) {
                            var obj = this._children[i];
                            if (obj.y != current.y) {
                                current = obj;
                                break;
                            }
                            k++;
                        }
                        for (; i >= 0; i--) {
                            obj = this._children[i];
                            if (obj.y != current.y) {
                                this.clearSelection();
                                this.addSelection(i + k + 1, true);
                                break;
                            }
                        }
                    }
                    break;
                case 3:
                    if (this._layout == fgui.ListLayoutType.SingleRow || this._layout == fgui.ListLayoutType.FlowHorizontal || this._layout == fgui.ListLayoutType.Pagination) {
                        index++;
                        if (index < this.numItems) {
                            this.clearSelection();
                            this.addSelection(index, true);
                        }
                    }
                    else if (this._layout == fgui.ListLayoutType.FlowVertical) {
                        current = this._children[index];
                        k = 0;
                        var cnt = this._children.length;
                        for (i = index + 1; i < cnt; i++) {
                            obj = this._children[i];
                            if (obj.x != current.x) {
                                current = obj;
                                break;
                            }
                            k++;
                        }
                        for (; i < cnt; i++) {
                            obj = this._children[i];
                            if (obj.x != current.x) {
                                this.clearSelection();
                                this.addSelection(i - k - 1, true);
                                break;
                            }
                        }
                    }
                    break;
                case 5:
                    if (this._layout == fgui.ListLayoutType.SingleColumn || this._layout == fgui.ListLayoutType.FlowVertical) {
                        index++;
                        if (index < this.numItems) {
                            this.clearSelection();
                            this.addSelection(index, true);
                        }
                    }
                    else if (this._layout == fgui.ListLayoutType.FlowHorizontal || this._layout == fgui.ListLayoutType.Pagination) {
                        current = this._children[index];
                        k = 0;
                        cnt = this._children.length;
                        for (i = index + 1; i < cnt; i++) {
                            obj = this._children[i];
                            if (obj.y != current.y) {
                                current = obj;
                                break;
                            }
                            k++;
                        }
                        for (; i < cnt; i++) {
                            obj = this._children[i];
                            if (obj.y != current.y) {
                                this.clearSelection();
                                this.addSelection(i - k - 1, true);
                                break;
                            }
                        }
                    }
                    break;
                case 7:
                    if (this._layout == fgui.ListLayoutType.SingleRow || this._layout == fgui.ListLayoutType.FlowHorizontal || this._layout == fgui.ListLayoutType.Pagination) {
                        index--;
                        if (index >= 0) {
                            this.clearSelection();
                            this.addSelection(index, true);
                        }
                    }
                    else if (this._layout == fgui.ListLayoutType.FlowVertical) {
                        current = this._children[index];
                        k = 0;
                        for (i = index - 1; i >= 0; i--) {
                            obj = this._children[i];
                            if (obj.x != current.x) {
                                current = obj;
                                break;
                            }
                            k++;
                        }
                        for (; i >= 0; i--) {
                            obj = this._children[i];
                            if (obj.x != current.x) {
                                this.clearSelection();
                                this.addSelection(i + k + 1, true);
                                break;
                            }
                        }
                    }
                    break;
            }
        }
        __clickItem(evt) {
            if (this._scrollPane != null && this._scrollPane.isDragged)
                return;
            var item = fgui.GObject.cast(evt.currentTarget);
            this.setSelectionOnEvent(item, evt);
            if (this._scrollPane && this.scrollItemToViewOnClick)
                this._scrollPane.scrollToView(item, true);
            this.dispatchItemEvent(item, fgui.Events.createEvent(fgui.Events.CLICK_ITEM, this.displayObject, evt));
        }
        dispatchItemEvent(item, evt) {
            this.displayObject.event(fgui.Events.CLICK_ITEM, [item, evt]);
        }
        setSelectionOnEvent(item, evt) {
            if (!(item instanceof fgui.GButton) || this._selectionMode == fgui.ListSelectionMode.None)
                return;
            var dontChangeLastIndex = false;
            var button = (item);
            var index = this.childIndexToItemIndex(this.getChildIndex(item));
            if (this._selectionMode == fgui.ListSelectionMode.Single) {
                if (!button.selected) {
                    this.clearSelectionExcept(button);
                    button.selected = true;
                }
            }
            else {
                if (evt.shiftKey) {
                    if (!button.selected) {
                        if (this._lastSelectedIndex != -1) {
                            var min = Math.min(this._lastSelectedIndex, index);
                            var max = Math.max(this._lastSelectedIndex, index);
                            max = Math.min(max, this.numItems - 1);
                            var i;
                            if (this._virtual) {
                                for (i = min; i <= max; i++) {
                                    var ii = this._virtualItems[i];
                                    if (ii.obj instanceof fgui.GButton)
                                        ii.obj.selected = true;
                                    ii.selected = true;
                                }
                            }
                            else {
                                for (i = min; i <= max; i++) {
                                    var obj = this.getChildAt(i).asButton;
                                    if (obj != null)
                                        obj.selected = true;
                                }
                            }
                            dontChangeLastIndex = true;
                        }
                        else {
                            button.selected = true;
                        }
                    }
                }
                else if (evt.ctrlKey || this._selectionMode == fgui.ListSelectionMode.Multiple_SingleClick) {
                    button.selected = !button.selected;
                }
                else {
                    if (!button.selected) {
                        this.clearSelectionExcept(button);
                        button.selected = true;
                    }
                    else
                        this.clearSelectionExcept(button);
                }
            }
            if (!dontChangeLastIndex)
                this._lastSelectedIndex = index;
            if (button.selected)
                this.updateSelectionController(index);
        }
        resizeToFit(itemCount = 1000000, minSize = 0) {
            this.ensureBoundsCorrect();
            var curCount = this.numItems;
            if (itemCount > curCount)
                itemCount = curCount;
            if (this._virtual) {
                var lineCount = Math.ceil(itemCount / this._curLineItemCount);
                if (this._layout == fgui.ListLayoutType.SingleColumn || this._layout == fgui.ListLayoutType.FlowHorizontal)
                    this.viewHeight = this.lineCount * this._itemSize.y + Math.max(0, this.lineCount - 1) * this._lineGap;
                else
                    this.viewWidth = this.lineCount * this._itemSize.x + Math.max(0, this.lineCount - 1) * this._columnGap;
            }
            else if (itemCount == 0) {
                if (this._layout == fgui.ListLayoutType.SingleColumn || this._layout == fgui.ListLayoutType.FlowHorizontal)
                    this.viewHeight = minSize;
                else
                    this.viewWidth = minSize;
            }
            else {
                var i = itemCount - 1;
                var obj = null;
                while (i >= 0) {
                    obj = this.getChildAt(i);
                    if (!this.foldInvisibleItems || obj.visible)
                        break;
                    i--;
                }
                if (i < 0) {
                    if (this._layout == fgui.ListLayoutType.SingleColumn || this._layout == fgui.ListLayoutType.FlowHorizontal)
                        this.viewHeight = minSize;
                    else
                        this.viewWidth = minSize;
                }
                else {
                    var size = 0;
                    if (this._layout == fgui.ListLayoutType.SingleColumn || this._layout == fgui.ListLayoutType.FlowHorizontal) {
                        size = obj.y + obj.height;
                        if (size < minSize)
                            size = minSize;
                        this.viewHeight = size;
                    }
                    else {
                        size = obj.x + obj.width;
                        if (size < minSize)
                            size = minSize;
                        this.viewWidth = size;
                    }
                }
            }
        }
        getMaxItemWidth() {
            var cnt = this._children.length;
            var max = 0;
            for (var i = 0; i < cnt; i++) {
                var child = this.getChildAt(i);
                if (child.width > max)
                    max = child.width;
            }
            return max;
        }
        handleSizeChanged() {
            super.handleSizeChanged();
            this.setBoundsChangedFlag();
            if (this._virtual)
                this.setVirtualListChangedFlag(true);
        }
        handleControllerChanged(c) {
            super.handleControllerChanged(c);
            if (this._selectionController == c)
                this.selectedIndex = c.selectedIndex;
        }
        updateSelectionController(index) {
            if (this._selectionController != null && !this._selectionController.changing
                && index < this._selectionController.pageCount) {
                var c = this._selectionController;
                this._selectionController = null;
                c.selectedIndex = index;
                this._selectionController = c;
            }
        }
        shouldSnapToNext(dir, delta, size) {
            return dir < 0 && delta > fgui.UIConfig.defaultScrollSnappingThreshold * size
                || dir > 0 && delta > (1 - fgui.UIConfig.defaultScrollSnappingThreshold) * size
                || dir == 0 && delta > size / 2;
        }
        getSnappingPositionWithDir(xValue, yValue, xDir, yDir, resultPoint = null) {
            if (this._virtual) {
                if (!resultPoint)
                    resultPoint = new Laya.Point();
                var saved;
                var index;
                var size;
                if (this._layout == fgui.ListLayoutType.SingleColumn || this._layout == fgui.ListLayoutType.FlowHorizontal) {
                    saved = yValue;
                    GList.pos_param = yValue;
                    index = this.getIndexOnPos1(false);
                    yValue = GList.pos_param;
                    if (index < this._virtualItems.length && index < this._realNumItems) {
                        size = this._virtualItems[index].height;
                        if (this.shouldSnapToNext(yDir, saved - yValue, size))
                            yValue += size + this._lineGap;
                    }
                }
                else if (this._layout == fgui.ListLayoutType.SingleRow || this._layout == fgui.ListLayoutType.FlowVertical) {
                    saved = xValue;
                    GList.pos_param = xValue;
                    index = this.getIndexOnPos2(false);
                    xValue = GList.pos_param;
                    if (index < this._virtualItems.length && index < this._realNumItems) {
                        size = this._virtualItems[index].width;
                        if (this.shouldSnapToNext(xDir, saved - xValue, size))
                            xValue += size + this._columnGap;
                    }
                }
                else {
                    saved = xValue;
                    GList.pos_param = xValue;
                    index = this.getIndexOnPos3(false);
                    xValue = GList.pos_param;
                    if (index < this._virtualItems.length && index < this._realNumItems) {
                        size = this._virtualItems[index].width;
                        if (this.shouldSnapToNext(xDir, saved - xValue, size))
                            xValue += size + this._columnGap;
                    }
                }
                resultPoint.x = xValue;
                resultPoint.y = yValue;
                return resultPoint;
            }
            else
                return super.getSnappingPositionWithDir(xValue, yValue, xDir, yDir, resultPoint);
        }
        scrollToView(index, ani = false, setFirst = false) {
            if (this._virtual) {
                if (this._numItems == 0)
                    return;
                this.checkVirtualList();
                if (index >= this._virtualItems.length)
                    throw new Error("Invalid child index: " + index + ">" + this._virtualItems.length);
                if (this._loop)
                    index = Math.floor(this._firstIndex / this._numItems) * this._numItems + index;
                var rect;
                var ii = this._virtualItems[index];
                var pos = 0;
                var i;
                if (this._layout == fgui.ListLayoutType.SingleColumn || this._layout == fgui.ListLayoutType.FlowHorizontal) {
                    for (i = this._curLineItemCount - 1; i < index; i += this._curLineItemCount)
                        pos += this._virtualItems[i].height + this._lineGap;
                    rect = new Laya.Rectangle(0, pos, this._itemSize.x, ii.height);
                }
                else if (this._layout == fgui.ListLayoutType.SingleRow || this._layout == fgui.ListLayoutType.FlowVertical) {
                    for (i = this._curLineItemCount - 1; i < index; i += this._curLineItemCount)
                        pos += this._virtualItems[i].width + this._columnGap;
                    rect = new Laya.Rectangle(pos, 0, ii.width, this._itemSize.y);
                }
                else {
                    var page = index / (this._curLineItemCount * this._curLineItemCount2);
                    rect = new Laya.Rectangle(page * this.viewWidth + (index % this._curLineItemCount) * (ii.width + this._columnGap), (index / this._curLineItemCount) % this._curLineItemCount2 * (ii.height + this._lineGap), ii.width, ii.height);
                }
                setFirst = true;
                if (this._scrollPane != null)
                    this._scrollPane.scrollToView(rect, ani, setFirst);
            }
            else {
                var obj = this.getChildAt(index);
                if (this._scrollPane != null)
                    this._scrollPane.scrollToView(obj, ani, setFirst);
                else if (this._parent != null && this._parent.scrollPane != null)
                    this._parent.scrollPane.scrollToView(obj, ani, setFirst);
            }
        }
        getFirstChildInView() {
            return this.childIndexToItemIndex(super.getFirstChildInView());
        }
        childIndexToItemIndex(index) {
            if (!this._virtual)
                return index;
            if (this._layout == fgui.ListLayoutType.Pagination) {
                for (var i = this._firstIndex; i < this._realNumItems; i++) {
                    if (this._virtualItems[i].obj != null) {
                        index--;
                        if (index < 0)
                            return i;
                    }
                }
                return index;
            }
            else {
                index += this._firstIndex;
                if (this._loop && this._numItems > 0)
                    index = index % this._numItems;
                return index;
            }
        }
        itemIndexToChildIndex(index) {
            if (!this._virtual)
                return index;
            if (this._layout == fgui.ListLayoutType.Pagination) {
                return this.getChildIndex(this._virtualItems[index].obj);
            }
            else {
                if (this._loop && this._numItems > 0) {
                    var j = this._firstIndex % this._numItems;
                    if (index >= j)
                        index = index - j;
                    else
                        index = this._numItems - j + index;
                }
                else
                    index -= this._firstIndex;
                return index;
            }
        }
        setVirtual() {
            this._setVirtual(false);
        }
        setVirtualAndLoop() {
            this._setVirtual(true);
        }
        _setVirtual(loop) {
            if (!this._virtual) {
                if (this._scrollPane == null)
                    throw new Error("Virtual list must be scrollable!");
                if (loop) {
                    if (this._layout == fgui.ListLayoutType.FlowHorizontal || this._layout == fgui.ListLayoutType.FlowVertical)
                        throw new Error("Loop list instanceof not supported for FlowHorizontal or FlowVertical this.layout!");
                    this._scrollPane.bouncebackEffect = false;
                }
                this._virtual = true;
                this._loop = loop;
                this._virtualItems = new Array();
                this.removeChildrenToPool();
                if (this._itemSize == null) {
                    this._itemSize = new Laya.Point();
                    var obj = this.getFromPool(null);
                    if (obj == null) {
                        throw new Error("Virtual List must have a default list item resource.");
                    }
                    else {
                        this._itemSize.x = obj.width;
                        this._itemSize.y = obj.height;
                    }
                    this.returnToPool(obj);
                }
                if (this._layout == fgui.ListLayoutType.SingleColumn || this._layout == fgui.ListLayoutType.FlowHorizontal) {
                    this._scrollPane.scrollStep = this._itemSize.y;
                    if (this._loop)
                        this._scrollPane._loop = 2;
                }
                else {
                    this._scrollPane.scrollStep = this._itemSize.x;
                    if (this._loop)
                        this._scrollPane._loop = 1;
                }
                this.on(fgui.Events.SCROLL, this, this.__scrolled);
                this.setVirtualListChangedFlag(true);
            }
        }
        get numItems() {
            if (this._virtual)
                return this._numItems;
            else
                return this._children.length;
        }
        set numItems(value) {
            var i;
            if (this._virtual) {
                if (this.itemRenderer == null)
                    throw new Error("set itemRenderer first!");
                this._numItems = value;
                if (this._loop)
                    this._realNumItems = this._numItems * 6;
                else
                    this._realNumItems = this._numItems;
                var oldCount = this._virtualItems.length;
                if (this._realNumItems > oldCount) {
                    for (i = oldCount; i < this._realNumItems; i++) {
                        var ii = new ItemInfo();
                        ii.width = this._itemSize.x;
                        ii.height = this._itemSize.y;
                        this._virtualItems.push(ii);
                    }
                }
                else {
                    for (i = this._realNumItems; i < oldCount; i++)
                        this._virtualItems[i].selected = false;
                }
                if (this._virtualListChanged != 0)
                    Laya.timer.clear(this, this._refreshVirtualList);
                this._refreshVirtualList();
            }
            else {
                var cnt = this._children.length;
                if (value > cnt) {
                    for (i = cnt; i < value; i++) {
                        if (this.itemProvider == null)
                            this.addItemFromPool();
                        else
                            this.addItemFromPool(this.itemProvider.runWith(i));
                    }
                }
                else {
                    this.removeChildrenToPool(value, cnt);
                }
                if (this.itemRenderer != null) {
                    for (i = 0; i < value; i++)
                        this.itemRenderer.runWith([i, this.getChildAt(i)]);
                }
            }
        }
        refreshVirtualList() {
            this.setVirtualListChangedFlag(false);
        }
        checkVirtualList() {
            if (this._virtualListChanged != 0) {
                this._refreshVirtualList();
                Laya.timer.clear(this, this._refreshVirtualList);
            }
        }
        setVirtualListChangedFlag(layoutChanged = false) {
            if (layoutChanged)
                this._virtualListChanged = 2;
            else if (this._virtualListChanged == 0)
                this._virtualListChanged = 1;
            Laya.timer.callLater(this, this._refreshVirtualList);
        }
        _refreshVirtualList() {
            if (!this._displayObject)
                return;
            var layoutChanged = this._virtualListChanged == 2;
            this._virtualListChanged = 0;
            this._eventLocked = true;
            if (layoutChanged) {
                if (this._layout == fgui.ListLayoutType.SingleColumn || this._layout == fgui.ListLayoutType.SingleRow)
                    this._curLineItemCount = 1;
                else if (this._layout == fgui.ListLayoutType.FlowHorizontal) {
                    if (this._columnCount > 0)
                        this._curLineItemCount = this._columnCount;
                    else {
                        this._curLineItemCount = Math.floor((this._scrollPane.viewWidth + this._columnGap) / (this._itemSize.x + this._columnGap));
                        if (this._curLineItemCount <= 0)
                            this._curLineItemCount = 1;
                    }
                }
                else if (this._layout == fgui.ListLayoutType.FlowVertical) {
                    if (this._lineCount > 0)
                        this._curLineItemCount = this._lineCount;
                    else {
                        this._curLineItemCount = Math.floor((this._scrollPane.viewHeight + this._lineGap) / (this._itemSize.y + this._lineGap));
                        if (this._curLineItemCount <= 0)
                            this._curLineItemCount = 1;
                    }
                }
                else {
                    if (this._columnCount > 0)
                        this._curLineItemCount = this._columnCount;
                    else {
                        this._curLineItemCount = Math.floor((this._scrollPane.viewWidth + this._columnGap) / (this._itemSize.x + this._columnGap));
                        if (this._curLineItemCount <= 0)
                            this._curLineItemCount = 1;
                    }
                    if (this._lineCount > 0)
                        this._curLineItemCount2 = this._lineCount;
                    else {
                        this._curLineItemCount2 = Math.floor((this._scrollPane.viewHeight + this._lineGap) / (this._itemSize.y + this._lineGap));
                        if (this._curLineItemCount2 <= 0)
                            this._curLineItemCount2 = 1;
                    }
                }
            }
            var ch = 0, cw = 0;
            if (this._realNumItems > 0) {
                var i;
                var len = Math.ceil(this._realNumItems / this._curLineItemCount) * this._curLineItemCount;
                var len2 = Math.min(this._curLineItemCount, this._realNumItems);
                if (this._layout == fgui.ListLayoutType.SingleColumn || this._layout == fgui.ListLayoutType.FlowHorizontal) {
                    for (i = 0; i < len; i += this._curLineItemCount)
                        ch += this._virtualItems[i].height + this._lineGap;
                    if (ch > 0)
                        ch -= this._lineGap;
                    if (this._autoResizeItem)
                        cw = this._scrollPane.viewWidth;
                    else {
                        for (i = 0; i < len2; i++)
                            cw += this._virtualItems[i].width + this._columnGap;
                        if (cw > 0)
                            cw -= this._columnGap;
                    }
                }
                else if (this._layout == fgui.ListLayoutType.SingleRow || this._layout == fgui.ListLayoutType.FlowVertical) {
                    for (i = 0; i < len; i += this._curLineItemCount)
                        cw += this._virtualItems[i].width + this._columnGap;
                    if (cw > 0)
                        cw -= this._columnGap;
                    if (this._autoResizeItem)
                        ch = this._scrollPane.viewHeight;
                    else {
                        for (i = 0; i < len2; i++)
                            ch += this._virtualItems[i].height + this._lineGap;
                        if (ch > 0)
                            ch -= this._lineGap;
                    }
                }
                else {
                    var pageCount = Math.ceil(len / (this._curLineItemCount * this._curLineItemCount2));
                    cw = pageCount * this.viewWidth;
                    ch = this.viewHeight;
                }
            }
            this.handleAlign(cw, ch);
            this._scrollPane.setContentSize(cw, ch);
            this._eventLocked = false;
            this.handleScroll(true);
        }
        __scrolled(evt) {
            this.handleScroll(false);
        }
        getIndexOnPos1(forceUpdate) {
            if (this._realNumItems < this._curLineItemCount) {
                GList.pos_param = 0;
                return 0;
            }
            var i;
            var pos2;
            var pos3;
            if (this.numChildren > 0 && !forceUpdate) {
                pos2 = this.getChildAt(0).y;
                if (pos2 > GList.pos_param) {
                    for (i = this._firstIndex - this._curLineItemCount; i >= 0; i -= this._curLineItemCount) {
                        pos2 -= (this._virtualItems[i].height + this._lineGap);
                        if (pos2 <= GList.pos_param) {
                            GList.pos_param = pos2;
                            return i;
                        }
                    }
                    GList.pos_param = 0;
                    return 0;
                }
                else {
                    for (i = this._firstIndex; i < this._realNumItems; i += this._curLineItemCount) {
                        pos3 = pos2 + this._virtualItems[i].height + this._lineGap;
                        if (pos3 > GList.pos_param) {
                            GList.pos_param = pos2;
                            return i;
                        }
                        pos2 = pos3;
                    }
                    GList.pos_param = pos2;
                    return this._realNumItems - this._curLineItemCount;
                }
            }
            else {
                pos2 = 0;
                for (i = 0; i < this._realNumItems; i += this._curLineItemCount) {
                    pos3 = pos2 + this._virtualItems[i].height + this._lineGap;
                    if (pos3 > GList.pos_param) {
                        GList.pos_param = pos2;
                        return i;
                    }
                    pos2 = pos3;
                }
                GList.pos_param = pos2;
                return this._realNumItems - this._curLineItemCount;
            }
        }
        getIndexOnPos2(forceUpdate) {
            if (this._realNumItems < this._curLineItemCount) {
                GList.pos_param = 0;
                return 0;
            }
            var i;
            var pos2;
            var pos3;
            if (this.numChildren > 0 && !forceUpdate) {
                pos2 = this.getChildAt(0).x;
                if (pos2 > GList.pos_param) {
                    for (i = this._firstIndex - this._curLineItemCount; i >= 0; i -= this._curLineItemCount) {
                        pos2 -= (this._virtualItems[i].width + this._columnGap);
                        if (pos2 <= GList.pos_param) {
                            GList.pos_param = pos2;
                            return i;
                        }
                    }
                    GList.pos_param = 0;
                    return 0;
                }
                else {
                    for (i = this._firstIndex; i < this._realNumItems; i += this._curLineItemCount) {
                        pos3 = pos2 + this._virtualItems[i].width + this._columnGap;
                        if (pos3 > GList.pos_param) {
                            GList.pos_param = pos2;
                            return i;
                        }
                        pos2 = pos3;
                    }
                    GList.pos_param = pos2;
                    return this._realNumItems - this._curLineItemCount;
                }
            }
            else {
                pos2 = 0;
                for (i = 0; i < this._realNumItems; i += this._curLineItemCount) {
                    pos3 = pos2 + this._virtualItems[i].width + this._columnGap;
                    if (pos3 > GList.pos_param) {
                        GList.pos_param = pos2;
                        return i;
                    }
                    pos2 = pos3;
                }
                GList.pos_param = pos2;
                return this._realNumItems - this._curLineItemCount;
            }
        }
        getIndexOnPos3(forceUpdate) {
            if (this._realNumItems < this._curLineItemCount) {
                GList.pos_param = 0;
                return 0;
            }
            var viewWidth = this.viewWidth;
            var page = Math.floor(GList.pos_param / viewWidth);
            var startIndex = page * (this._curLineItemCount * this._curLineItemCount2);
            var pos2 = page * viewWidth;
            var i;
            var pos3;
            for (i = 0; i < this._curLineItemCount; i++) {
                pos3 = pos2 + this._virtualItems[startIndex + i].width + this._columnGap;
                if (pos3 > GList.pos_param) {
                    GList.pos_param = pos2;
                    return startIndex + i;
                }
                pos2 = pos3;
            }
            GList.pos_param = pos2;
            return startIndex + this._curLineItemCount - 1;
        }
        handleScroll(forceUpdate) {
            if (this._eventLocked)
                return;
            if (this._layout == fgui.ListLayoutType.SingleColumn || this._layout == fgui.ListLayoutType.FlowHorizontal) {
                var enterCounter = 0;
                while (this.handleScroll1(forceUpdate)) {
                    enterCounter++;
                    forceUpdate = false;
                    if (enterCounter > 20) {
                        console.log("FairyGUI: list will never be <the> filled item renderer function always returns a different size.");
                        break;
                    }
                }
                this.handleArchOrder1();
            }
            else if (this._layout == fgui.ListLayoutType.SingleRow || this._layout == fgui.ListLayoutType.FlowVertical) {
                enterCounter = 0;
                while (this.handleScroll2(forceUpdate)) {
                    enterCounter++;
                    forceUpdate = false;
                    if (enterCounter > 20) {
                        console.log("FairyGUI: list will never be <the> filled item renderer function always returns a different size.");
                        break;
                    }
                }
                this.handleArchOrder2();
            }
            else {
                this.handleScroll3(forceUpdate);
            }
            this._boundsChanged = false;
        }
        handleScroll1(forceUpdate) {
            var pos = this._scrollPane.scrollingPosY;
            var max = pos + this._scrollPane.viewHeight;
            var end = max == this._scrollPane.contentHeight;
            GList.pos_param = pos;
            var newFirstIndex = this.getIndexOnPos1(forceUpdate);
            pos = GList.pos_param;
            if (newFirstIndex == this._firstIndex && !forceUpdate)
                return false;
            var oldFirstIndex = this._firstIndex;
            this._firstIndex = newFirstIndex;
            var curIndex = newFirstIndex;
            var forward = oldFirstIndex > newFirstIndex;
            var childCount = this.numChildren;
            var lastIndex = oldFirstIndex + childCount - 1;
            var reuseIndex = forward ? lastIndex : oldFirstIndex;
            var curX = 0, curY = pos;
            var needRender;
            var deltaSize = 0;
            var firstItemDeltaSize = 0;
            var url = this.defaultItem;
            var ii, ii2;
            var i, j;
            var partSize = (this._scrollPane.viewWidth - this._columnGap * (this._curLineItemCount - 1)) / this._curLineItemCount;
            this.itemInfoVer++;
            while (curIndex < this._realNumItems && (end || curY < max)) {
                ii = this._virtualItems[curIndex];
                if (ii.obj == null || forceUpdate) {
                    if (this.itemProvider != null) {
                        url = this.itemProvider.runWith(curIndex % this._numItems);
                        if (url == null)
                            url = this._defaultItem;
                        url = fgui.UIPackage.normalizeURL(url);
                    }
                    if (ii.obj != null && ii.obj.resourceURL != url) {
                        if (ii.obj instanceof fgui.GButton)
                            ii.selected = ii.obj.selected;
                        this.removeChildToPool(ii.obj);
                        ii.obj = null;
                    }
                }
                if (ii.obj == null) {
                    if (forward) {
                        for (j = reuseIndex; j >= oldFirstIndex; j--) {
                            ii2 = this._virtualItems[j];
                            if (ii2.obj != null && ii2.updateFlag != this.itemInfoVer && ii2.obj.resourceURL == url) {
                                if (ii2.obj instanceof fgui.GButton)
                                    ii2.selected = ii2.obj.selected;
                                ii.obj = ii2.obj;
                                ii2.obj = null;
                                if (j == reuseIndex)
                                    reuseIndex--;
                                break;
                            }
                        }
                    }
                    else {
                        for (j = reuseIndex; j <= lastIndex; j++) {
                            ii2 = this._virtualItems[j];
                            if (ii2.obj != null && ii2.updateFlag != this.itemInfoVer && ii2.obj.resourceURL == url) {
                                if (ii2.obj instanceof fgui.GButton)
                                    ii2.selected = ii2.obj.selected;
                                ii.obj = ii2.obj;
                                ii2.obj = null;
                                if (j == reuseIndex)
                                    reuseIndex++;
                                break;
                            }
                        }
                    }
                    if (ii.obj != null) {
                        this.setChildIndex(ii.obj, forward ? curIndex - newFirstIndex : this.numChildren);
                    }
                    else {
                        ii.obj = this._pool.getObject(url);
                        if (forward)
                            this.addChildAt(ii.obj, curIndex - newFirstIndex);
                        else
                            this.addChild(ii.obj);
                    }
                    if (ii.obj instanceof fgui.GButton)
                        ii.obj.selected = ii.selected;
                    needRender = true;
                }
                else
                    needRender = forceUpdate;
                if (needRender) {
                    if (this._autoResizeItem && (this._layout == fgui.ListLayoutType.SingleColumn || this._columnCount > 0))
                        ii.obj.setSize(partSize, ii.obj.height, true);
                    this.itemRenderer.runWith([curIndex % this._numItems, ii.obj]);
                    if (curIndex % this._curLineItemCount == 0) {
                        deltaSize += Math.ceil(ii.obj.height) - ii.height;
                        if (curIndex == newFirstIndex && oldFirstIndex > newFirstIndex) {
                            firstItemDeltaSize = Math.ceil(ii.obj.height) - ii.height;
                        }
                    }
                    ii.width = Math.ceil(ii.obj.width);
                    ii.height = Math.ceil(ii.obj.height);
                }
                ii.updateFlag = this.itemInfoVer;
                ii.obj.setXY(curX, curY);
                if (curIndex == newFirstIndex)
                    max += ii.height;
                curX += ii.width + this._columnGap;
                if (curIndex % this._curLineItemCount == this._curLineItemCount - 1) {
                    curX = 0;
                    curY += ii.height + this._lineGap;
                }
                curIndex++;
            }
            for (i = 0; i < childCount; i++) {
                ii = this._virtualItems[oldFirstIndex + i];
                if (ii.updateFlag != this.itemInfoVer && ii.obj != null) {
                    if (ii.obj instanceof fgui.GButton)
                        ii.selected = ii.obj.selected;
                    this.removeChildToPool(ii.obj);
                    ii.obj = null;
                }
            }
            childCount = this._children.length;
            for (i = 0; i < childCount; i++) {
                var obj = this._virtualItems[newFirstIndex + i].obj;
                if (this._children[i] != obj)
                    this.setChildIndex(obj, i);
            }
            if (deltaSize != 0 || firstItemDeltaSize != 0)
                this._scrollPane.changeContentSizeOnScrolling(0, deltaSize, 0, firstItemDeltaSize);
            if (curIndex > 0 && this.numChildren > 0 && this._container.y <= 0 && this.getChildAt(0).y > -this._container.y)
                return true;
            else
                return false;
        }
        handleScroll2(forceUpdate) {
            var pos = this._scrollPane.scrollingPosX;
            var max = pos + this._scrollPane.viewWidth;
            var end = pos == this._scrollPane.contentWidth;
            GList.pos_param = pos;
            var newFirstIndex = this.getIndexOnPos2(forceUpdate);
            pos = GList.pos_param;
            if (newFirstIndex == this._firstIndex && !forceUpdate)
                return false;
            var oldFirstIndex = this._firstIndex;
            this._firstIndex = newFirstIndex;
            var curIndex = newFirstIndex;
            var forward = oldFirstIndex > newFirstIndex;
            var childCount = this.numChildren;
            var lastIndex = oldFirstIndex + childCount - 1;
            var reuseIndex = forward ? lastIndex : oldFirstIndex;
            var curX = pos, curY = 0;
            var needRender;
            var deltaSize = 0;
            var firstItemDeltaSize = 0;
            var url = this.defaultItem;
            var ii, ii2;
            var i, j;
            var partSize = (this._scrollPane.viewHeight - this._lineGap * (this._curLineItemCount - 1)) / this._curLineItemCount;
            this.itemInfoVer++;
            while (curIndex < this._realNumItems && (end || curX < max)) {
                ii = this._virtualItems[curIndex];
                if (ii.obj == null || forceUpdate) {
                    if (this.itemProvider != null) {
                        url = this.itemProvider.runWith(curIndex % this._numItems);
                        if (url == null)
                            url = this._defaultItem;
                        url = fgui.UIPackage.normalizeURL(url);
                    }
                    if (ii.obj != null && ii.obj.resourceURL != url) {
                        if (ii.obj instanceof fgui.GButton)
                            ii.selected = ii.obj.selected;
                        this.removeChildToPool(ii.obj);
                        ii.obj = null;
                    }
                }
                if (ii.obj == null) {
                    if (forward) {
                        for (j = reuseIndex; j >= oldFirstIndex; j--) {
                            ii2 = this._virtualItems[j];
                            if (ii2.obj != null && ii2.updateFlag != this.itemInfoVer && ii2.obj.resourceURL == url) {
                                if (ii2.obj instanceof fgui.GButton)
                                    ii2.selected = ii2.obj.selected;
                                ii.obj = ii2.obj;
                                ii2.obj = null;
                                if (j == reuseIndex)
                                    reuseIndex--;
                                break;
                            }
                        }
                    }
                    else {
                        for (j = reuseIndex; j <= lastIndex; j++) {
                            ii2 = this._virtualItems[j];
                            if (ii2.obj != null && ii2.updateFlag != this.itemInfoVer && ii2.obj.resourceURL == url) {
                                if (ii2.obj instanceof fgui.GButton)
                                    ii2.selected = ii2.obj.selected;
                                ii.obj = ii2.obj;
                                ii2.obj = null;
                                if (j == reuseIndex)
                                    reuseIndex++;
                                break;
                            }
                        }
                    }
                    if (ii.obj != null) {
                        this.setChildIndex(ii.obj, forward ? curIndex - newFirstIndex : this.numChildren);
                    }
                    else {
                        ii.obj = this._pool.getObject(url);
                        if (forward)
                            this.addChildAt(ii.obj, curIndex - newFirstIndex);
                        else
                            this.addChild(ii.obj);
                    }
                    if (ii.obj instanceof fgui.GButton)
                        ii.obj.selected = ii.selected;
                    needRender = true;
                }
                else
                    needRender = forceUpdate;
                if (needRender) {
                    if (this._autoResizeItem && (this._layout == fgui.ListLayoutType.SingleRow || this._lineCount > 0))
                        ii.obj.setSize(ii.obj.width, partSize, true);
                    this.itemRenderer.runWith([curIndex % this._numItems, ii.obj]);
                    if (curIndex % this._curLineItemCount == 0) {
                        deltaSize += Math.ceil(ii.obj.width) - ii.width;
                        if (curIndex == newFirstIndex && oldFirstIndex > newFirstIndex) {
                            firstItemDeltaSize = Math.ceil(ii.obj.width) - ii.width;
                        }
                    }
                    ii.width = Math.ceil(ii.obj.width);
                    ii.height = Math.ceil(ii.obj.height);
                }
                ii.updateFlag = this.itemInfoVer;
                ii.obj.setXY(curX, curY);
                if (curIndex == newFirstIndex)
                    max += ii.width;
                curY += ii.height + this._lineGap;
                if (curIndex % this._curLineItemCount == this._curLineItemCount - 1) {
                    curY = 0;
                    curX += ii.width + this._columnGap;
                }
                curIndex++;
            }
            for (i = 0; i < childCount; i++) {
                ii = this._virtualItems[oldFirstIndex + i];
                if (ii.updateFlag != this.itemInfoVer && ii.obj != null) {
                    if (ii.obj instanceof fgui.GButton)
                        ii.selected = ii.obj.selected;
                    this.removeChildToPool(ii.obj);
                    ii.obj = null;
                }
            }
            childCount = this._children.length;
            for (i = 0; i < childCount; i++) {
                var obj = this._virtualItems[newFirstIndex + i].obj;
                if (this._children[i] != obj)
                    this.setChildIndex(obj, i);
            }
            if (deltaSize != 0 || firstItemDeltaSize != 0)
                this._scrollPane.changeContentSizeOnScrolling(deltaSize, 0, firstItemDeltaSize, 0);
            if (curIndex > 0 && this.numChildren > 0 && this._container.x <= 0 && this.getChildAt(0).x > -this._container.x)
                return true;
            else
                return false;
        }
        handleScroll3(forceUpdate) {
            var pos = this._scrollPane.scrollingPosX;
            GList.pos_param = pos;
            var newFirstIndex = this.getIndexOnPos3(forceUpdate);
            pos = GList.pos_param;
            if (newFirstIndex == this._firstIndex && !forceUpdate)
                return;
            var oldFirstIndex = this._firstIndex;
            this._firstIndex = newFirstIndex;
            var reuseIndex = oldFirstIndex;
            var virtualItemCount = this._virtualItems.length;
            var pageSize = this._curLineItemCount * this._curLineItemCount2;
            var startCol = newFirstIndex % this._curLineItemCount;
            var viewWidth = this.viewWidth;
            var page = Math.floor(newFirstIndex / pageSize);
            var startIndex = page * pageSize;
            var lastIndex = startIndex + pageSize * 2;
            var needRender;
            var i;
            var ii, ii2;
            var col;
            var url = this._defaultItem;
            var partWidth = (this._scrollPane.viewWidth - this._columnGap * (this._curLineItemCount - 1)) / this._curLineItemCount;
            var partHeight = (this._scrollPane.viewHeight - this._lineGap * (this._curLineItemCount2 - 1)) / this._curLineItemCount2;
            this.itemInfoVer++;
            for (i = startIndex; i < lastIndex; i++) {
                if (i >= this._realNumItems)
                    continue;
                col = i % this._curLineItemCount;
                if (i - startIndex < pageSize) {
                    if (col < startCol)
                        continue;
                }
                else {
                    if (col > startCol)
                        continue;
                }
                ii = this._virtualItems[i];
                ii.updateFlag = this.itemInfoVer;
            }
            var lastObj = null;
            var insertIndex = 0;
            for (i = startIndex; i < lastIndex; i++) {
                if (i >= this._realNumItems)
                    continue;
                ii = this._virtualItems[i];
                if (ii.updateFlag != this.itemInfoVer)
                    continue;
                if (ii.obj == null) {
                    while (reuseIndex < virtualItemCount) {
                        ii2 = this._virtualItems[reuseIndex];
                        if (ii2.obj != null && ii2.updateFlag != this.itemInfoVer) {
                            if (ii2.obj instanceof fgui.GButton)
                                ii2.selected = ii2.obj.selected;
                            ii.obj = ii2.obj;
                            ii2.obj = null;
                            break;
                        }
                        reuseIndex++;
                    }
                    if (insertIndex == -1)
                        insertIndex = this.getChildIndex(lastObj) + 1;
                    if (ii.obj == null) {
                        if (this.itemProvider != null) {
                            url = this.itemProvider.runWith(i % this._numItems);
                            if (url == null)
                                url = this._defaultItem;
                            url = fgui.UIPackage.normalizeURL(url);
                        }
                        ii.obj = this._pool.getObject(url);
                        this.addChildAt(ii.obj, insertIndex);
                    }
                    else {
                        insertIndex = this.setChildIndexBefore(ii.obj, insertIndex);
                    }
                    insertIndex++;
                    if (ii.obj instanceof fgui.GButton)
                        ii.obj.selected = ii.selected;
                    needRender = true;
                }
                else {
                    needRender = forceUpdate;
                    insertIndex = -1;
                    lastObj = ii.obj;
                }
                if (needRender) {
                    if (this._autoResizeItem) {
                        if (this._curLineItemCount == this._columnCount && this._curLineItemCount2 == this._lineCount)
                            ii.obj.setSize(partWidth, partHeight, true);
                        else if (this._curLineItemCount == this._columnCount)
                            ii.obj.setSize(partWidth, ii.obj.height, true);
                        else if (this._curLineItemCount2 == this._lineCount)
                            ii.obj.setSize(ii.obj.width, partHeight, true);
                    }
                    this.itemRenderer.runWith([i % this._numItems, ii.obj]);
                    ii.width = Math.ceil(ii.obj.width);
                    ii.height = Math.ceil(ii.obj.height);
                }
            }
            var borderX = (startIndex / pageSize) * viewWidth;
            var xx = borderX;
            var yy = 0;
            var lineHeight = 0;
            for (i = startIndex; i < lastIndex; i++) {
                if (i >= this._realNumItems)
                    continue;
                ii = this._virtualItems[i];
                if (ii.updateFlag == this.itemInfoVer)
                    ii.obj.setXY(xx, yy);
                if (ii.height > lineHeight)
                    lineHeight = ii.height;
                if (i % this._curLineItemCount == this._curLineItemCount - 1) {
                    xx = borderX;
                    yy += lineHeight + this._lineGap;
                    lineHeight = 0;
                    if (i == startIndex + pageSize - 1) {
                        borderX += viewWidth;
                        xx = borderX;
                        yy = 0;
                    }
                }
                else
                    xx += ii.width + this._columnGap;
            }
            for (i = reuseIndex; i < virtualItemCount; i++) {
                ii = this._virtualItems[i];
                if (ii.updateFlag != this.itemInfoVer && ii.obj != null) {
                    if (ii.obj instanceof fgui.GButton)
                        ii.selected = ii.obj.selected;
                    this.removeChildToPool(ii.obj);
                    ii.obj = null;
                }
            }
        }
        handleArchOrder1() {
            if (this.childrenRenderOrder == fgui.ChildrenRenderOrder.Arch) {
                var mid = this._scrollPane.posY + this.viewHeight / 2;
                var minDist = Number.POSITIVE_INFINITY;
                var dist = 0;
                var apexIndex = 0;
                var cnt = this.numChildren;
                for (var i = 0; i < cnt; i++) {
                    var obj = this.getChildAt(i);
                    if (!this.foldInvisibleItems || obj.visible) {
                        dist = Math.abs(mid - obj.y - obj.height / 2);
                        if (dist < minDist) {
                            minDist = dist;
                            apexIndex = i;
                        }
                    }
                }
                this.apexIndex = apexIndex;
            }
        }
        handleArchOrder2() {
            if (this.childrenRenderOrder == fgui.ChildrenRenderOrder.Arch) {
                var mid = this._scrollPane.posX + this.viewWidth / 2;
                var minDist = Number.POSITIVE_INFINITY;
                var dist = 0;
                var apexIndex = 0;
                var cnt = this.numChildren;
                for (var i = 0; i < cnt; i++) {
                    var obj = this.getChildAt(i);
                    if (!this.foldInvisibleItems || obj.visible) {
                        dist = Math.abs(mid - obj.x - obj.width / 2);
                        if (dist < minDist) {
                            minDist = dist;
                            apexIndex = i;
                        }
                    }
                }
                this.apexIndex = apexIndex;
            }
        }
        handleAlign(contentWidth, contentHeight) {
            var newOffsetX = 0;
            var newOffsetY = 0;
            if (contentHeight < this.viewHeight) {
                if (this._verticalAlign == "middle")
                    newOffsetY = Math.floor((this.viewHeight - contentHeight) / 2);
                else if (this._verticalAlign == "bottom")
                    newOffsetY = this.viewHeight - contentHeight;
            }
            if (contentWidth < this.viewWidth) {
                if (this._align == "center")
                    newOffsetX = Math.floor((this.viewWidth - contentWidth) / 2);
                else if (this._align == "right")
                    newOffsetX = this.viewWidth - contentWidth;
            }
            if (newOffsetX != this._alignOffset.x || newOffsetY != this._alignOffset.y) {
                this._alignOffset.setTo(newOffsetX, newOffsetY);
                if (this._scrollPane != null)
                    this._scrollPane.adjustMaskContainer();
                else
                    this._container.pos(this._margin.left + this._alignOffset.x, this._margin.top + this._alignOffset.y);
            }
        }
        updateBounds() {
            if (this._virtual)
                return;
            var i;
            var child;
            var curX = 0;
            var curY = 0;
            var maxWidth = 0;
            var maxHeight = 0;
            var cw, ch;
            var j = 0;
            var page = 0;
            var k = 0;
            var cnt = this._children.length;
            var viewWidth = this.viewWidth;
            var viewHeight = this.viewHeight;
            var lineSize = 0;
            var lineStart = 0;
            var ratio;
            if (this._layout == fgui.ListLayoutType.SingleColumn) {
                for (i = 0; i < cnt; i++) {
                    child = this.getChildAt(i);
                    if (this.foldInvisibleItems && !child.visible)
                        continue;
                    if (curY != 0)
                        curY += this._lineGap;
                    child.y = curY;
                    if (this._autoResizeItem)
                        child.setSize(viewWidth, child.height, true);
                    curY += Math.ceil(child.height);
                    if (child.width > maxWidth)
                        maxWidth = child.width;
                }
                ch = curY;
                if (ch <= viewHeight && this._autoResizeItem && this._scrollPane && this._scrollPane._displayInDemand && this._scrollPane.vtScrollBar) {
                    viewWidth += this._scrollPane.vtScrollBar.width;
                    for (i = 0; i < cnt; i++) {
                        child = this.getChildAt(i);
                        if (this.foldInvisibleItems && !child.visible)
                            continue;
                        child.setSize(viewWidth, child.height, true);
                        if (child.width > maxWidth)
                            maxWidth = child.width;
                    }
                }
                cw = Math.ceil(maxWidth);
            }
            else if (this._layout == fgui.ListLayoutType.SingleRow) {
                for (i = 0; i < cnt; i++) {
                    child = this.getChildAt(i);
                    if (this.foldInvisibleItems && !child.visible)
                        continue;
                    if (curX != 0)
                        curX += this._columnGap;
                    child.x = curX;
                    if (this._autoResizeItem)
                        child.setSize(child.width, viewHeight, true);
                    curX += Math.ceil(child.width);
                    if (child.height > maxHeight)
                        maxHeight = child.height;
                }
                cw = curX;
                if (cw <= viewWidth && this._autoResizeItem && this._scrollPane && this._scrollPane._displayInDemand && this._scrollPane.hzScrollBar) {
                    viewHeight += this._scrollPane.hzScrollBar.height;
                    for (i = 0; i < cnt; i++) {
                        child = this.getChildAt(i);
                        if (this.foldInvisibleItems && !child.visible)
                            continue;
                        child.setSize(child.width, viewHeight, true);
                        if (child.height > maxHeight)
                            maxHeight = child.height;
                    }
                }
                ch = Math.ceil(maxHeight);
            }
            else if (this._layout == fgui.ListLayoutType.FlowHorizontal) {
                if (this._autoResizeItem && this._columnCount > 0) {
                    for (i = 0; i < cnt; i++) {
                        child = this.getChildAt(i);
                        if (this.foldInvisibleItems && !child.visible)
                            continue;
                        lineSize += child.sourceWidth;
                        j++;
                        if (j == this._columnCount || i == cnt - 1) {
                            ratio = (viewWidth - lineSize - (j - 1) * this._columnGap) / lineSize;
                            curX = 0;
                            for (j = lineStart; j <= i; j++) {
                                child = this.getChildAt(j);
                                if (this.foldInvisibleItems && !child.visible)
                                    continue;
                                child.setXY(curX, curY);
                                if (j < i) {
                                    child.setSize(child.sourceWidth + Math.round(child.sourceWidth * ratio), child.height, true);
                                    curX += Math.ceil(child.width) + this._columnGap;
                                }
                                else {
                                    child.setSize(viewWidth - curX, child.height, true);
                                }
                                if (child.height > maxHeight)
                                    maxHeight = child.height;
                            }
                            curY += Math.ceil(maxHeight) + this._lineGap;
                            maxHeight = 0;
                            j = 0;
                            lineStart = i + 1;
                            lineSize = 0;
                        }
                    }
                    ch = curY + Math.ceil(maxHeight);
                    cw = viewWidth;
                }
                else {
                    for (i = 0; i < cnt; i++) {
                        child = this.getChildAt(i);
                        if (this.foldInvisibleItems && !child.visible)
                            continue;
                        if (curX != 0)
                            curX += this._columnGap;
                        if (this._columnCount != 0 && j >= this._columnCount
                            || this._columnCount == 0 && curX + child.width > viewWidth && maxHeight != 0) {
                            curX = 0;
                            curY += Math.ceil(maxHeight) + this._lineGap;
                            maxHeight = 0;
                            j = 0;
                        }
                        child.setXY(curX, curY);
                        curX += Math.ceil(child.width);
                        if (curX > maxWidth)
                            maxWidth = curX;
                        if (child.height > maxHeight)
                            maxHeight = child.height;
                        j++;
                    }
                    ch = curY + Math.ceil(maxHeight);
                    cw = Math.ceil(maxWidth);
                }
            }
            else if (this._layout == fgui.ListLayoutType.FlowVertical) {
                if (this._autoResizeItem && this._lineCount > 0) {
                    for (i = 0; i < cnt; i++) {
                        child = this.getChildAt(i);
                        if (this.foldInvisibleItems && !child.visible)
                            continue;
                        lineSize += child.sourceHeight;
                        j++;
                        if (j == this._lineCount || i == cnt - 1) {
                            ratio = (viewHeight - lineSize - (j - 1) * this._lineGap) / lineSize;
                            curY = 0;
                            for (j = lineStart; j <= i; j++) {
                                child = this.getChildAt(j);
                                if (this.foldInvisibleItems && !child.visible)
                                    continue;
                                child.setXY(curX, curY);
                                if (j < i) {
                                    child.setSize(child.width, child.sourceHeight + Math.round(child.sourceHeight * ratio), true);
                                    curY += Math.ceil(child.height) + this._lineGap;
                                }
                                else {
                                    child.setSize(child.width, viewHeight - curY, true);
                                }
                                if (child.width > maxWidth)
                                    maxWidth = child.width;
                            }
                            curX += Math.ceil(maxWidth) + this._columnGap;
                            maxWidth = 0;
                            j = 0;
                            lineStart = i + 1;
                            lineSize = 0;
                        }
                    }
                    cw = curX + Math.ceil(maxWidth);
                    ch = viewHeight;
                }
                else {
                    for (i = 0; i < cnt; i++) {
                        child = this.getChildAt(i);
                        if (this.foldInvisibleItems && !child.visible)
                            continue;
                        if (curY != 0)
                            curY += this._lineGap;
                        if (this._lineCount != 0 && j >= this._lineCount
                            || this._lineCount == 0 && curY + child.height > viewHeight && maxWidth != 0) {
                            curY = 0;
                            curX += Math.ceil(maxWidth) + this._columnGap;
                            maxWidth = 0;
                            j = 0;
                        }
                        child.setXY(curX, curY);
                        curY += Math.ceil(child.height);
                        if (curY > maxHeight)
                            maxHeight = curY;
                        if (child.width > maxWidth)
                            maxWidth = child.width;
                        j++;
                    }
                    cw = curX + Math.ceil(maxWidth);
                    ch = Math.ceil(maxHeight);
                }
            }
            else {
                var eachHeight;
                if (this._autoResizeItem && this._lineCount > 0)
                    eachHeight = Math.floor((viewHeight - (this._lineCount - 1) * this._lineGap) / this._lineCount);
                if (this._autoResizeItem && this._columnCount > 0) {
                    for (i = 0; i < cnt; i++) {
                        child = this.getChildAt(i);
                        if (this.foldInvisibleItems && !child.visible)
                            continue;
                        if (j == 0 && (this._lineCount != 0 && k >= this._lineCount
                            || this._lineCount == 0 && curY + child.height > viewHeight)) {
                            page++;
                            curY = 0;
                            k = 0;
                        }
                        lineSize += child.sourceWidth;
                        j++;
                        if (j == this._columnCount || i == cnt - 1) {
                            ratio = (viewWidth - lineSize - (j - 1) * this._columnGap) / lineSize;
                            curX = 0;
                            for (j = lineStart; j <= i; j++) {
                                child = this.getChildAt(j);
                                if (this.foldInvisibleItems && !child.visible)
                                    continue;
                                child.setXY(page * viewWidth + curX, curY);
                                if (j < i) {
                                    child.setSize(child.sourceWidth + Math.round(child.sourceWidth * ratio), this._lineCount > 0 ? eachHeight : child.height, true);
                                    curX += Math.ceil(child.width) + this._columnGap;
                                }
                                else {
                                    child.setSize(viewWidth - curX, this._lineCount > 0 ? eachHeight : child.height, true);
                                }
                                if (child.height > maxHeight)
                                    maxHeight = child.height;
                            }
                            curY += Math.ceil(maxHeight) + this._lineGap;
                            maxHeight = 0;
                            j = 0;
                            lineStart = i + 1;
                            lineSize = 0;
                            k++;
                        }
                    }
                }
                else {
                    for (i = 0; i < cnt; i++) {
                        child = this.getChildAt(i);
                        if (this.foldInvisibleItems && !child.visible)
                            continue;
                        if (curX != 0)
                            curX += this._columnGap;
                        if (this._autoResizeItem && this._lineCount > 0)
                            child.setSize(child.width, eachHeight, true);
                        if (this._columnCount != 0 && j >= this._columnCount
                            || this._columnCount == 0 && curX + child.width > viewWidth && maxHeight != 0) {
                            curX = 0;
                            curY += Math.ceil(maxHeight) + this._lineGap;
                            maxHeight = 0;
                            j = 0;
                            k++;
                            if (this._lineCount != 0 && k >= this._lineCount
                                || this._lineCount == 0 && curY + child.height > viewHeight && maxWidth != 0) {
                                page++;
                                curY = 0;
                                k = 0;
                            }
                        }
                        child.setXY(page * viewWidth + curX, curY);
                        curX += Math.ceil(child.width);
                        if (curX > maxWidth)
                            maxWidth = curX;
                        if (child.height > maxHeight)
                            maxHeight = child.height;
                        j++;
                    }
                }
                ch = page > 0 ? viewHeight : curY + Math.ceil(maxHeight);
                cw = (page + 1) * viewWidth;
            }
            this.handleAlign(cw, ch);
            this.setBounds(0, 0, cw, ch);
        }
        setup_beforeAdd(buffer, beginPos) {
            super.setup_beforeAdd(buffer, beginPos);
            buffer.seek(beginPos, 5);
            var i1;
            this._layout = buffer.readByte();
            this._selectionMode = buffer.readByte();
            i1 = buffer.readByte();
            this._align = i1 == 0 ? "left" : (i1 == 1 ? "center" : "right");
            i1 = buffer.readByte();
            this._verticalAlign = i1 == 0 ? "top" : (i1 == 1 ? "middle" : "bottom");
            this._lineGap = buffer.getInt16();
            this._columnGap = buffer.getInt16();
            this._lineCount = buffer.getInt16();
            this._columnCount = buffer.getInt16();
            this._autoResizeItem = buffer.readBool();
            this._childrenRenderOrder = buffer.readByte();
            this._apexIndex = buffer.getInt16();
            if (buffer.readBool()) {
                this._margin.top = buffer.getInt32();
                this._margin.bottom = buffer.getInt32();
                this._margin.left = buffer.getInt32();
                this._margin.right = buffer.getInt32();
            }
            var overflow = buffer.readByte();
            if (overflow == fgui.OverflowType.Scroll) {
                var savedPos = buffer.pos;
                buffer.seek(beginPos, 7);
                this.setupScroll(buffer);
                buffer.pos = savedPos;
            }
            else
                this.setupOverflow(overflow);
            if (buffer.readBool())
                buffer.skip(8);
            if (buffer.version >= 2) {
                this.scrollItemToViewOnClick = buffer.readBool();
                this.foldInvisibleItems = buffer.readBool();
            }
            buffer.seek(beginPos, 8);
            this._defaultItem = buffer.readS();
            this.readItems(buffer);
        }
        readItems(buffer) {
            var cnt;
            var i;
            var nextPos;
            var str;
            cnt = buffer.getInt16();
            for (i = 0; i < cnt; i++) {
                nextPos = buffer.getInt16();
                nextPos += buffer.pos;
                str = buffer.readS();
                if (str == null) {
                    str = this.defaultItem;
                    if (!str) {
                        buffer.pos = nextPos;
                        continue;
                    }
                }
                var obj = this.getFromPool(str);
                if (obj != null) {
                    this.addChild(obj);
                    this.setupItem(buffer, obj);
                }
                buffer.pos = nextPos;
            }
        }
        setupItem(buffer, obj) {
            var str;
            str = buffer.readS();
            if (str != null)
                obj.text = str;
            str = buffer.readS();
            if (str != null && (obj instanceof fgui.GButton))
                obj.selectedTitle = str;
            str = buffer.readS();
            if (str != null)
                obj.icon = str;
            str = buffer.readS();
            if (str != null && (obj instanceof fgui.GButton))
                obj.selectedIcon = str;
            str = buffer.readS();
            if (str != null)
                obj.name = str;
            var cnt;
            var i;
            if (obj instanceof fgui.GComponent) {
                cnt = buffer.getInt16();
                for (i = 0; i < cnt; i++) {
                    var cc = obj.getController(buffer.readS());
                    str = buffer.readS();
                    if (cc != null)
                        cc.selectedPageId = str;
                }
                if (buffer.version >= 2) {
                    cnt = buffer.getInt16();
                    for (i = 0; i < cnt; i++) {
                        var target = buffer.readS();
                        var propertyId = buffer.getInt16();
                        var value = buffer.readS();
                        var obj2 = obj.getChildByPath(target);
                        if (obj2)
                            obj2.setProp(propertyId, value);
                    }
                }
            }
        }
        setup_afterAdd(buffer, beginPos) {
            super.setup_afterAdd(buffer, beginPos);
            buffer.seek(beginPos, 6);
            var i = buffer.getInt16();
            if (i != -1)
                this._selectionController = this._parent.getControllerAt(i);
        }
    }
    fgui.GList = GList;
    class ItemInfo {
        constructor() {
            this.width = 0;
            this.height = 0;
            this.updateFlag = 0;
            this.selected = false;
        }
    }
})(fgui || (fgui = {}));

(function (fgui) {
    class GObjectPool {
        constructor() {
            this._count = 0;
            this._pool = {};
        }
        clear() {
            for (var i1 in this._pool) {
                var arr = this._pool[i1];
                var cnt = arr.length;
                for (var i = 0; i < cnt; i++)
                    arr[i].dispose();
            }
            this._pool = {};
            this._count = 0;
        }
        get count() {
            return this._count;
        }
        getObject(url) {
            url = fgui.UIPackage.normalizeURL(url);
            if (url == null)
                return null;
            var arr = this._pool[url];
            if (arr != null && arr.length > 0) {
                this._count--;
                return arr.shift();
            }
            var child = fgui.UIPackage.createObjectFromURL(url);
            return child;
        }
        returnObject(obj) {
            var url = obj.resourceURL;
            if (!url)
                return;
            var arr = this._pool[url];
            if (arr == null) {
                arr = [];
                this._pool[url] = arr;
            }
            this._count++;
            arr.push(obj);
        }
    }
    fgui.GObjectPool = GObjectPool;
})(fgui || (fgui = {}));

(function (fgui) {
    class GLoader extends fgui.GObject {
        constructor() {
            super();
            this._contentSourceWidth = 0;
            this._contentSourceHeight = 0;
            this._contentWidth = 0;
            this._contentHeight = 0;
            this._url = "";
            this._fill = fgui.LoaderFillType.None;
            this._align = "left";
            this._valign = "top";
            this._showErrorSign = true;
        }
        createDisplayObject() {
            super.createDisplayObject();
            this._content = new fgui.MovieClip();
            this._displayObject.addChild(this._content);
            this._displayObject.mouseEnabled = true;
        }
        dispose() {
            if (this._contentItem == null && this._content.texture != null) {
                this.freeExternal(this._content.texture);
            }
            if (this._content2 != null)
                this._content2.dispose();
            super.dispose();
        }
        get url() {
            return this._url;
        }
        set url(value) {
            if (this._url == value)
                return;
            this._url = value;
            this.loadContent();
            this.updateGear(7);
        }
        get icon() {
            return this._url;
        }
        set icon(value) {
            this.url = value;
        }
        get align() {
            return this._align;
        }
        set align(value) {
            if (this._align != value) {
                this._align = value;
                this.updateLayout();
            }
        }
        get verticalAlign() {
            return this._valign;
        }
        set verticalAlign(value) {
            if (this._valign != value) {
                this._valign = value;
                this.updateLayout();
            }
        }
        get fill() {
            return this._fill;
        }
        set fill(value) {
            if (this._fill != value) {
                this._fill = value;
                this.updateLayout();
            }
        }
        get shrinkOnly() {
            return this._shrinkOnly;
        }
        set shrinkOnly(value) {
            if (this._shrinkOnly != value) {
                this._shrinkOnly = value;
                this.updateLayout();
            }
        }
        get autoSize() {
            return this._autoSize;
        }
        set autoSize(value) {
            if (this._autoSize != value) {
                this._autoSize = value;
                this.updateLayout();
            }
        }
        get playing() {
            return this._content.playing;
        }
        set playing(value) {
            if (this._content.playing != value) {
                this._content.playing = value;
                this.updateGear(5);
            }
        }
        get frame() {
            return this._content.frame;
        }
        set frame(value) {
            if (this._content.frame != value) {
                this._content.frame = value;
                this.updateGear(5);
            }
        }
        get color() {
            return this._content.color;
        }
        set color(value) {
            if (this._content.color != value) {
                this._content.color = value;
                this.updateGear(4);
            }
        }
        get showErrorSign() {
            return this._showErrorSign;
        }
        set showErrorSign(value) {
            this._showErrorSign = value;
        }
        get content() {
            return this._content;
        }
        get component() {
            return this._content2;
        }
        loadContent() {
            this.clearContent();
            if (!this._url)
                return;
            if (fgui.ToolSet.startsWith(this._url, "ui://"))
                this.loadFromPackage(this._url);
            else
                this.loadExternal();
        }
        loadFromPackage(itemURL) {
            this._contentItem = fgui.UIPackage.getItemByURL(itemURL);
            if (this._contentItem != null) {
                this._contentItem = this._contentItem.getBranch();
                this._contentSourceWidth = this._contentItem.width;
                this._contentSourceHeight = this._contentItem.height;
                this._contentItem = this._contentItem.getHighResolution();
                this._contentItem.load();
                if (this._autoSize)
                    this.setSize(this._contentSourceWidth, this._contentSourceHeight);
                if (this._contentItem.type == fgui.PackageItemType.Image) {
                    if (this._contentItem.texture == null) {
                        this.setErrorState();
                    }
                    else {
                        this._content.texture = this._contentItem.texture;
                        this._content.scale9Grid = this._contentItem.scale9Grid;
                        this._content.scaleByTile = this._contentItem.scaleByTile;
                        this._content.tileGridIndice = this._contentItem.tileGridIndice;
                        this._contentSourceWidth = this._contentItem.width;
                        this._contentSourceHeight = this._contentItem.height;
                        this.updateLayout();
                    }
                }
                else if (this._contentItem.type == fgui.PackageItemType.MovieClip) {
                    this._contentSourceWidth = this._contentItem.width;
                    this._contentSourceHeight = this._contentItem.height;
                    this._content.interval = this._contentItem.interval;
                    this._content.swing = this._contentItem.swing;
                    this._content.repeatDelay = this._contentItem.repeatDelay;
                    this._content.frames = this._contentItem.frames;
                    this.updateLayout();
                }
                else if (this._contentItem.type == fgui.PackageItemType.Component) {
                    var obj = fgui.UIPackage.createObjectFromURL(itemURL);
                    if (!obj)
                        this.setErrorState();
                    else if (!(obj instanceof fgui.GComponent)) {
                        obj.dispose();
                        this.setErrorState();
                    }
                    else {
                        this._content2 = obj.asCom;
                        this._displayObject.addChild(this._content2.displayObject);
                        this.updateLayout();
                    }
                }
                else
                    this.setErrorState();
            }
            else
                this.setErrorState();
        }
        loadExternal() {
            fgui.AssetProxy.inst.load(this._url, Laya.Handler.create(this, this.__getResCompleted), null, Laya.Loader.IMAGE);
        }
        freeExternal(texture) {
        }
        onExternalLoadSuccess(texture) {
            this._content.texture = texture;
            this._content.scale9Grid = null;
            this._content.scaleByTile = false;
            this._contentSourceWidth = texture.width;
            this._contentSourceHeight = texture.height;
            this.updateLayout();
        }
        onExternalLoadFailed() {
            this.setErrorState();
        }
        __getResCompleted(tex) {
            if (tex != null)
                this.onExternalLoadSuccess(tex);
            else
                this.onExternalLoadFailed();
        }
        setErrorState() {
            if (!this._showErrorSign)
                return;
            if (this._errorSign == null) {
                if (fgui.UIConfig.loaderErrorSign != null) {
                    this._errorSign = GLoader._errorSignPool.getObject(fgui.UIConfig.loaderErrorSign);
                }
            }
            if (this._errorSign != null) {
                this._errorSign.setSize(this.width, this.height);
                this._displayObject.addChild(this._errorSign.displayObject);
            }
        }
        clearErrorState() {
            if (this._errorSign != null) {
                this._displayObject.removeChild(this._errorSign.displayObject);
                GLoader._errorSignPool.returnObject(this._errorSign);
                this._errorSign = null;
            }
        }
        updateLayout() {
            if (this._content2 == null && this._content.texture == null && this._content.frames == null) {
                if (this._autoSize) {
                    this._updatingLayout = true;
                    this.setSize(50, 30);
                    this._updatingLayout = false;
                }
                return;
            }
            this._contentWidth = this._contentSourceWidth;
            this._contentHeight = this._contentSourceHeight;
            if (this._autoSize) {
                this._updatingLayout = true;
                if (this._contentWidth == 0)
                    this._contentWidth = 50;
                if (this._contentHeight == 0)
                    this._contentHeight = 30;
                this.setSize(this._contentWidth, this._contentHeight);
                this._updatingLayout = false;
                if (this._contentWidth == this._width && this._contentHeight == this._height) {
                    if (this._content2 != null) {
                        this._content2.setXY(0, 0);
                        this._content2.setScale(1, 1);
                    }
                    else {
                        this._content.size(this._contentWidth, this._contentHeight);
                        this._content.pos(0, 0);
                    }
                    return;
                }
            }
            var sx = 1, sy = 1;
            if (this._fill != fgui.LoaderFillType.None) {
                sx = this.width / this._contentSourceWidth;
                sy = this.height / this._contentSourceHeight;
                if (sx != 1 || sy != 1) {
                    if (this._fill == fgui.LoaderFillType.ScaleMatchHeight)
                        sx = sy;
                    else if (this._fill == fgui.LoaderFillType.ScaleMatchWidth)
                        sy = sx;
                    else if (this._fill == fgui.LoaderFillType.Scale) {
                        if (sx > sy)
                            sx = sy;
                        else
                            sy = sx;
                    }
                    else if (this._fill == fgui.LoaderFillType.ScaleNoBorder) {
                        if (sx > sy)
                            sy = sx;
                        else
                            sx = sy;
                    }
                    if (this._shrinkOnly) {
                        if (sx > 1)
                            sx = 1;
                        if (sy > 1)
                            sy = 1;
                    }
                    this._contentWidth = this._contentSourceWidth * sx;
                    this._contentHeight = this._contentSourceHeight * sy;
                }
            }
            if (this._content2 != null)
                this._content2.setScale(sx, sy);
            else
                this._content.size(this._contentWidth, this._contentHeight);
            var nx, ny;
            if (this._align == "center")
                nx = Math.floor((this.width - this._contentWidth) / 2);
            else if (this._align == "right")
                nx = this.width - this._contentWidth;
            else
                nx = 0;
            if (this._valign == "middle")
                ny = Math.floor((this.height - this._contentHeight) / 2);
            else if (this._valign == "bottom")
                ny = this.height - this._contentHeight;
            else
                ny = 0;
            if (this._content2 != null)
                this._content2.setXY(nx, ny);
            else
                this._content.pos(nx, ny);
        }
        clearContent() {
            this.clearErrorState();
            if (this._contentItem == null && this._content.texture != null) {
                this.freeExternal(this._content.texture);
            }
            this._content.texture = null;
            this._content.frames = null;
            if (this._content2 != null) {
                this._content2.dispose();
                this._content2 = null;
            }
            this._contentItem = null;
        }
        handleSizeChanged() {
            super.handleSizeChanged();
            if (!this._updatingLayout)
                this.updateLayout();
        }
        getProp(index) {
            switch (index) {
                case fgui.ObjectPropID.Color:
                    return this.color;
                case fgui.ObjectPropID.Playing:
                    return this.playing;
                case fgui.ObjectPropID.Frame:
                    return this.frame;
                case fgui.ObjectPropID.TimeScale:
                    return this._content.timeScale;
                default:
                    return super.getProp(index);
            }
        }
        setProp(index, value) {
            switch (index) {
                case fgui.ObjectPropID.Color:
                    this.color = value;
                    break;
                case fgui.ObjectPropID.Playing:
                    this.playing = value;
                    break;
                case fgui.ObjectPropID.Frame:
                    this.frame = value;
                    break;
                case fgui.ObjectPropID.TimeScale:
                    this._content.timeScale = value;
                    break;
                case fgui.ObjectPropID.DeltaTime:
                    this._content.advance(value);
                    break;
                default:
                    super.setProp(index, value);
                    break;
            }
        }
        setup_beforeAdd(buffer, beginPos) {
            super.setup_beforeAdd(buffer, beginPos);
            buffer.seek(beginPos, 5);
            var iv;
            this._url = buffer.readS();
            iv = buffer.readByte();
            this._align = iv == 0 ? "left" : (iv == 1 ? "center" : "right");
            iv = buffer.readByte();
            this._valign = iv == 0 ? "top" : (iv == 1 ? "middle" : "bottom");
            this._fill = buffer.readByte();
            this._shrinkOnly = buffer.readBool();
            this._autoSize = buffer.readBool();
            this._showErrorSign = buffer.readBool();
            this._content.playing = buffer.readBool();
            this._content.frame = buffer.getInt32();
            if (buffer.readBool())
                this.color = buffer.readColorS();
            this._content.fillMethod = buffer.readByte();
            if (this._content.fillMethod != 0) {
                this._content.fillOrigin = buffer.readByte();
                this._content.fillClockwise = buffer.readBool();
                this._content.fillAmount = buffer.getFloat32();
            }
            if (this._url)
                this.loadContent();
        }
    }
    GLoader._errorSignPool = new fgui.GObjectPool();
    fgui.GLoader = GLoader;
})(fgui || (fgui = {}));

(function (fgui) {
    class GMovieClip extends fgui.GObject {
        constructor() {
            super();
        }
        get color() {
            return this._movieClip.color;
        }
        set color(value) {
            this._movieClip.color = value;
        }
        createDisplayObject() {
            this._displayObject = this._movieClip = new fgui.MovieClip();
            this._movieClip.mouseEnabled = false;
            this._displayObject["$owner"] = this;
        }
        get playing() {
            return this._movieClip.playing;
        }
        set playing(value) {
            if (this._movieClip.playing != value) {
                this._movieClip.playing = value;
                this.updateGear(5);
            }
        }
        get frame() {
            return this._movieClip.frame;
        }
        set frame(value) {
            if (this._movieClip.frame != value) {
                this._movieClip.frame = value;
                this.updateGear(5);
            }
        }
        get timeScale() {
            return this._movieClip.timeScale;
        }
        set timeScale(value) {
            this._movieClip.timeScale = value;
        }
        rewind() {
            this._movieClip.rewind();
        }
        syncStatus(anotherMc) {
            this._movieClip.syncStatus(anotherMc._movieClip);
        }
        advance(timeInMiniseconds) {
            this._movieClip.advance(timeInMiniseconds);
        }
        setPlaySettings(start = 0, end = -1, times = 0, endAt = -1, endHandler = null) {
            this._movieClip.setPlaySettings(start, end, times, endAt, endHandler);
        }
        getProp(index) {
            switch (index) {
                case fgui.ObjectPropID.Color:
                    return this.color;
                case fgui.ObjectPropID.Playing:
                    return this.playing;
                case fgui.ObjectPropID.Frame:
                    return this.frame;
                case fgui.ObjectPropID.TimeScale:
                    return this.timeScale;
                default:
                    return super.getProp(index);
            }
        }
        setProp(index, value) {
            switch (index) {
                case fgui.ObjectPropID.Color:
                    this.color = value;
                    break;
                case fgui.ObjectPropID.Playing:
                    this.playing = value;
                    break;
                case fgui.ObjectPropID.Frame:
                    this.frame = value;
                    break;
                case fgui.ObjectPropID.TimeScale:
                    this.timeScale = value;
                    break;
                case fgui.ObjectPropID.DeltaTime:
                    this.advance(value);
                    break;
                default:
                    super.setProp(index, value);
                    break;
            }
        }
        constructFromResource() {
            var displayItem = this.packageItem.getBranch();
            this.sourceWidth = displayItem.width;
            this.sourceHeight = displayItem.height;
            this.initWidth = this.sourceWidth;
            this.initHeight = this.sourceHeight;
            this.setSize(this.sourceWidth, this.sourceHeight);
            displayItem = displayItem.getHighResolution();
            displayItem.load();
            this._movieClip.interval = displayItem.interval;
            this._movieClip.swing = displayItem.swing;
            this._movieClip.repeatDelay = displayItem.repeatDelay;
            this._movieClip.frames = displayItem.frames;
        }
        setup_beforeAdd(buffer, beginPos) {
            super.setup_beforeAdd(buffer, beginPos);
            buffer.seek(beginPos, 5);
            if (buffer.readBool())
                this.color = buffer.readColorS();
            buffer.readByte();
            this._movieClip.frame = buffer.getInt32();
            this._movieClip.playing = buffer.readBool();
        }
    }
    fgui.GMovieClip = GMovieClip;
})(fgui || (fgui = {}));

(function (fgui) {
    class GProgressBar extends fgui.GComponent {
        constructor() {
            super();
            this._min = 0;
            this._max = 0;
            this._value = 0;
            this._barMaxWidth = 0;
            this._barMaxHeight = 0;
            this._barMaxWidthDelta = 0;
            this._barMaxHeightDelta = 0;
            this._barStartX = 0;
            this._barStartY = 0;
            this._titleType = fgui.ProgressTitleType.Percent;
            this._value = 50;
            this._max = 100;
        }
        get titleType() {
            return this._titleType;
        }
        set titleType(value) {
            if (this._titleType != value) {
                this._titleType = value;
                this.update(value);
            }
        }
        get min() {
            return this._min;
        }
        set min(value) {
            if (this._min != value) {
                this._min = value;
                this.update(this._value);
            }
        }
        get max() {
            return this._max;
        }
        set max(value) {
            if (this._max != value) {
                this._max = value;
                this.update(this._value);
            }
        }
        get value() {
            return this._value;
        }
        set value(value) {
            if (this._value != value) {
                fgui.GTween.kill(this, false, this.update);
                this._value = value;
                this.update(value);
            }
        }
        tweenValue(value, duration) {
            var oldValule;
            var tweener = fgui.GTween.getTween(this, this.update);
            if (tweener != null) {
                oldValule = tweener.value.x;
                tweener.kill();
            }
            else
                oldValule = this._value;
            this._value = value;
            return fgui.GTween.to(oldValule, this._value, duration).setTarget(this, this.update).setEase(fgui.EaseType.Linear);
        }
        update(newValue) {
            var percent = fgui.ToolSet.clamp01((newValue - this._min) / (this._max - this._min));
            if (this._titleObject) {
                switch (this._titleType) {
                    case fgui.ProgressTitleType.Percent:
                        this._titleObject.text = Math.floor(percent * 100) + "%";
                        break;
                    case fgui.ProgressTitleType.ValueAndMax:
                        this._titleObject.text = Math.floor(newValue) + "/" + Math.floor(this._max);
                        break;
                    case fgui.ProgressTitleType.Value:
                        this._titleObject.text = "" + Math.floor(newValue);
                        break;
                    case fgui.ProgressTitleType.Max:
                        this._titleObject.text = "" + Math.floor(this._max);
                        break;
                }
            }
            var fullWidth = this.width - this._barMaxWidthDelta;
            var fullHeight = this.height - this._barMaxHeightDelta;
            if (!this._reverse) {
                if (this._barObjectH) {
                    if ((this._barObjectH instanceof fgui.GImage) && this._barObjectH.fillMethod != fgui.FillMethod.None)
                        this._barObjectH.fillAmount = percent;
                    else
                        this._barObjectH.width = Math.floor(fullWidth * percent);
                }
                if (this._barObjectV) {
                    if ((this._barObjectV instanceof fgui.GImage) && this._barObjectV.fillMethod != fgui.FillMethod.None)
                        this._barObjectV.fillAmount = percent;
                    else
                        this._barObjectV.height = Math.floor(fullHeight * percent);
                }
            }
            else {
                if (this._barObjectH) {
                    if ((this._barObjectH instanceof fgui.GImage) && this._barObjectH.fillMethod != fgui.FillMethod.None)
                        this._barObjectH.fillAmount = 1 - percent;
                    else {
                        this._barObjectH.width = Math.floor(fullWidth * percent);
                        this._barObjectH.x = this._barStartX + (fullWidth - this._barObjectH.width);
                    }
                }
                if (this._barObjectV) {
                    if ((this._barObjectV instanceof fgui.GImage) && this._barObjectV.fillMethod != fgui.FillMethod.None)
                        this._barObjectV.fillAmount = 1 - percent;
                    else {
                        this._barObjectV.height = Math.floor(fullHeight * percent);
                        this._barObjectV.y = this._barStartY + (fullHeight - this._barObjectV.height);
                    }
                }
            }
            if (this._aniObject)
                this._aniObject.setProp(fgui.ObjectPropID.Frame, Math.floor(percent * 100));
        }
        constructExtension(buffer) {
            buffer.seek(0, 6);
            this._titleType = buffer.readByte();
            this._reverse = buffer.readBool();
            this._titleObject = this.getChild("title");
            this._barObjectH = this.getChild("bar");
            this._barObjectV = this.getChild("bar_v");
            this._aniObject = this.getChild("ani");
            if (this._barObjectH) {
                this._barMaxWidth = this._barObjectH.width;
                this._barMaxWidthDelta = this.width - this._barMaxWidth;
                this._barStartX = this._barObjectH.x;
            }
            if (this._barObjectV) {
                this._barMaxHeight = this._barObjectV.height;
                this._barMaxHeightDelta = this.height - this._barMaxHeight;
                this._barStartY = this._barObjectV.y;
            }
        }
        handleSizeChanged() {
            super.handleSizeChanged();
            if (this._barObjectH)
                this._barMaxWidth = this.width - this._barMaxWidthDelta;
            if (this._barObjectV)
                this._barMaxHeight = this.height - this._barMaxHeightDelta;
            if (!this._underConstruct)
                this.update(this._value);
        }
        setup_afterAdd(buffer, beginPos) {
            super.setup_afterAdd(buffer, beginPos);
            if (!buffer.seek(beginPos, 6)) {
                this.update(this._value);
                return;
            }
            if (buffer.readByte() != this.packageItem.objectType) {
                this.update(this._value);
                return;
            }
            this._value = buffer.getInt32();
            this._max = buffer.getInt32();
            if (buffer.version >= 2)
                this._min = buffer.getInt32();
            this.update(this._value);
        }
    }
    fgui.GProgressBar = GProgressBar;
})(fgui || (fgui = {}));

(function (fgui) {
    class GRichTextField extends fgui.GTextField {
        constructor() {
            super();
            this._text = "";
        }
        createDisplayObject() {
            this._displayObject = this._div = new Laya.HTMLDivElement();
            this._displayObject.mouseEnabled = true;
            this._displayObject["$owner"] = this;
        }
        get div() {
            return this._div;
        }
        set text(value) {
            this._text = value;
            var text2 = this._text;
            if (this._templateVars != null)
                text2 = this.parseTemplate(text2);
            try {
                if (this._ubbEnabled)
                    this._div.innerHTML = fgui.ToolSet.parseUBB(text2);
                else
                    this._div.innerHTML = text2;
                if (this._widthAutoSize || this._heightAutoSize) {
                    var w, h = 0;
                    if (this._widthAutoSize) {
                        w = this._div.contextWidth;
                        if (w > 0)
                            w += 8;
                    }
                    else
                        w = this._width;
                    if (this._heightAutoSize)
                        h = this._div.contextHeight;
                    else
                        h = this._height;
                    this._updatingSize = true;
                    this.setSize(w, h);
                    this._updatingSize = false;
                }
            }
            catch (err) {
                console.log("laya reports html error:" + err);
            }
        }
        get text() {
            return this._text;
        }
        get font() {
            return this._div.style.font;
        }
        set font(value) {
            if (value)
                this._div.style.font = value;
            else
                this._div.style.font = fgui.UIConfig.defaultFont;
        }
        get fontSize() {
            return this._div.style.fontSize;
        }
        set fontSize(value) {
            this._div.style.fontSize = value;
        }
        get color() {
            return this._color;
        }
        set color(value) {
            if (this._color != value) {
                this._color = value;
                this._div.style.color = value;
                if (this._gearColor.controller)
                    this._gearColor.updateState();
            }
        }
        get align() {
            return this._div.style.align;
        }
        set align(value) {
            this._div.style.align = value;
        }
        get valign() {
            return this._div.style.valign;
        }
        set valign(value) {
            this._div.style.valign = value;
        }
        get leading() {
            return this._div.style.leading;
        }
        set leading(value) {
            this._div.style.leading = value;
        }
        get bold() {
            return this._div.style.bold;
        }
        set bold(value) {
            this._div.style.bold = value;
        }
        get italic() {
            return this._div.style.italic;
        }
        set italic(value) {
            this._div.style.italic = value;
        }
        get stroke() {
            return this._div.style.stroke;
        }
        set stroke(value) {
            this._div.style.stroke = value;
        }
        get strokeColor() {
            return this._div.style.strokeColor;
        }
        set strokeColor(value) {
            this._div.style.strokeColor = value;
            this.updateGear(4);
        }
        set ubbEnabled(value) {
            this._ubbEnabled = value;
        }
        get ubbEnabled() {
            return this._ubbEnabled;
        }
        get textWidth() {
            var w = this._div.contextWidth;
            if (w > 0)
                w += 8;
            return w;
        }
        updateAutoSize() {
            this._div.style.wordWrap = !this._widthAutoSize;
        }
        handleSizeChanged() {
            if (this._updatingSize)
                return;
            this._div.size(this._width, this._height);
            this._div.style.width = this._width;
            this._div.style.height = this._height;
        }
    }
    fgui.GRichTextField = GRichTextField;
})(fgui || (fgui = {}));

(function (fgui) {
    class GRoot extends fgui.GComponent {
        constructor() {
            super();
            if (GRoot._inst == null)
                GRoot._inst = this;
            this.opaque = false;
            this._popupStack = [];
            this._justClosedPopups = [];
            this.displayObject.once(Laya.Event.DISPLAY, this, this.__addedToStage);
        }
        static get inst() {
            if (GRoot._inst == null)
                new GRoot();
            return GRoot._inst;
        }
        showWindow(win) {
            this.addChild(win);
            win.requestFocus();
            if (win.x > this.width)
                win.x = this.width - win.width;
            else if (win.x + win.width < 0)
                win.x = 0;
            if (win.y > this.height)
                win.y = this.height - win.height;
            else if (win.y + win.height < 0)
                win.y = 0;
            this.adjustModalLayer();
        }
        hideWindow(win) {
            win.hide();
        }
        hideWindowImmediately(win) {
            if (win.parent == this)
                this.removeChild(win);
            this.adjustModalLayer();
        }
        bringToFront(win) {
            var cnt = this.numChildren;
            var i;
            if (this._modalLayer.parent != null && !win.modal)
                i = this.getChildIndex(this._modalLayer) - 1;
            else
                i = cnt - 1;
            for (; i >= 0; i--) {
                var g = this.getChildAt(i);
                if (g == win)
                    return;
                if (g instanceof fgui.Window)
                    break;
            }
            if (i >= 0)
                this.setChildIndex(win, i);
        }
        showModalWait(msg = null) {
            if (fgui.UIConfig.globalModalWaiting != null) {
                if (this._modalWaitPane == null)
                    this._modalWaitPane = fgui.UIPackage.createObjectFromURL(fgui.UIConfig.globalModalWaiting);
                this._modalWaitPane.setSize(this.width, this.height);
                this._modalWaitPane.addRelation(this, fgui.RelationType.Size);
                this.addChild(this._modalWaitPane);
                this._modalWaitPane.text = msg;
            }
        }
        closeModalWait() {
            if (this._modalWaitPane != null && this._modalWaitPane.parent != null)
                this.removeChild(this._modalWaitPane);
        }
        closeAllExceptModals() {
            var arr = this._children.slice();
            var cnt = arr.length;
            for (var i = 0; i < cnt; i++) {
                var g = arr[i];
                if ((g instanceof fgui.Window) && !g.modal)
                    g.hide();
            }
        }
        closeAllWindows() {
            var arr = this._children.slice();
            var cnt = arr.length;
            for (var i = 0; i < cnt; i++) {
                var g = arr[i];
                if (g instanceof fgui.Window)
                    g.hide();
            }
        }
        getTopWindow() {
            var cnt = this.numChildren;
            for (var i = cnt - 1; i >= 0; i--) {
                var g = this.getChildAt(i);
                if (g instanceof fgui.Window) {
                    return g;
                }
            }
            return null;
        }
        get modalLayer() {
            return this._modalLayer;
        }
        get hasModalWindow() {
            return this._modalLayer.parent != null;
        }
        get modalWaiting() {
            return this._modalWaitPane && this._modalWaitPane.inContainer;
        }
        showPopup(popup, target = null, downward = null) {
            if (this._popupStack.length > 0) {
                var k = this._popupStack.indexOf(popup);
                if (k != -1) {
                    for (var i = this._popupStack.length - 1; i >= k; i--)
                        this.removeChild(this._popupStack.pop());
                }
            }
            this._popupStack.push(popup);
            if (target != null) {
                var p = target;
                while (p != null) {
                    if (p.parent == this) {
                        if (popup.sortingOrder < p.sortingOrder) {
                            popup.sortingOrder = p.sortingOrder;
                        }
                        break;
                    }
                    p = p.parent;
                }
            }
            this.addChild(popup);
            this.adjustModalLayer();
            var pos;
            var sizeW = 0, sizeH = 0;
            if (target) {
                pos = target.localToGlobal();
                sizeW = target.width;
                sizeH = target.height;
            }
            else {
                pos = this.globalToLocal(Laya.stage.mouseX, Laya.stage.mouseY);
            }
            var xx, yy;
            xx = pos.x;
            if (xx + popup.width > this.width)
                xx = xx + sizeW - popup.width;
            yy = pos.y + sizeH;
            if ((downward == null && yy + popup.height > this.height)
                || downward == false) {
                yy = pos.y - popup.height - 1;
                if (yy < 0) {
                    yy = 0;
                    xx += sizeW / 2;
                }
            }
            popup.x = xx;
            popup.y = yy;
        }
        togglePopup(popup, target = null, downward = null) {
            if (this._justClosedPopups.indexOf(popup) != -1)
                return;
            this.showPopup(popup, target, downward);
        }
        hidePopup(popup = null) {
            if (popup != null) {
                var k = this._popupStack.indexOf(popup);
                if (k != -1) {
                    for (var i = this._popupStack.length - 1; i >= k; i--)
                        this.closePopup(this._popupStack.pop());
                }
            }
            else {
                var cnt = this._popupStack.length;
                for (i = cnt - 1; i >= 0; i--)
                    this.closePopup(this._popupStack[i]);
                this._popupStack.length = 0;
            }
        }
        get hasAnyPopup() {
            return this._popupStack.length != 0;
        }
        closePopup(target) {
            if (target.parent != null) {
                if (target instanceof fgui.Window)
                    target.hide();
                else
                    this.removeChild(target);
            }
        }
        showTooltips(msg) {
            if (this._defaultTooltipWin == null) {
                var resourceURL = fgui.UIConfig.tooltipsWin;
                if (!resourceURL) {
                    Laya.Log.print("UIConfig.tooltipsWin not defined");
                    return;
                }
                this._defaultTooltipWin = fgui.UIPackage.createObjectFromURL(resourceURL);
            }
            this._defaultTooltipWin.text = msg;
            this.showTooltipsWin(this._defaultTooltipWin);
        }
        showTooltipsWin(tooltipWin, position = null) {
            this.hideTooltips();
            this._tooltipWin = tooltipWin;
            var xx = 0;
            var yy = 0;
            if (position == null) {
                xx = Laya.stage.mouseX + 10;
                yy = Laya.stage.mouseY + 20;
            }
            else {
                xx = position.x;
                yy = position.y;
            }
            var pt = this.globalToLocal(xx, yy);
            xx = pt.x;
            yy = pt.y;
            if (xx + this._tooltipWin.width > this.width) {
                xx = xx - this._tooltipWin.width - 1;
                if (xx < 0)
                    xx = 10;
            }
            if (yy + this._tooltipWin.height > this.height) {
                yy = yy - this._tooltipWin.height - 1;
                if (xx - this._tooltipWin.width - 1 > 0)
                    xx = xx - this._tooltipWin.width - 1;
                if (yy < 0)
                    yy = 10;
            }
            this._tooltipWin.x = xx;
            this._tooltipWin.y = yy;
            this.addChild(this._tooltipWin);
        }
        hideTooltips() {
            if (this._tooltipWin != null) {
                if (this._tooltipWin.parent)
                    this.removeChild(this._tooltipWin);
                this._tooltipWin = null;
            }
        }
        getObjectUnderPoint(globalX, globalY) {
            return null;
        }
        get focus() {
            if (this._focusedObject && !this._focusedObject.onStage)
                this._focusedObject = null;
            return this._focusedObject;
        }
        set focus(value) {
            if (value && (!value.focusable || !value.onStage))
                throw "invalid this.focus target";
            this.setFocus(value);
        }
        setFocus(value) {
            if (this._focusedObject != value) {
                this._focusedObject = value;
                this.displayObject.event(fgui.Events.FOCUS_CHANGED);
            }
        }
        get volumeScale() {
            return Laya.SoundManager.soundVolume;
        }
        set volumeScale(value) {
            Laya.SoundManager.soundVolume = value;
        }
        playOneShotSound(url, volumeScale = 1) {
            if (fgui.ToolSet.startsWith(url, "ui://"))
                return;
            Laya.SoundManager.playSound(url);
        }
        adjustModalLayer() {
            var cnt = this.numChildren;
            if (this._modalWaitPane != null && this._modalWaitPane.parent != null)
                this.setChildIndex(this._modalWaitPane, cnt - 1);
            for (var i = cnt - 1; i >= 0; i--) {
                var g = this.getChildAt(i);
                if ((g instanceof fgui.Window) && g.modal) {
                    if (this._modalLayer.parent == null)
                        this.addChildAt(this._modalLayer, i);
                    else
                        this.setChildIndexBefore(this._modalLayer, i);
                    return;
                }
            }
            if (this._modalLayer.parent != null)
                this.removeChild(this._modalLayer);
        }
        __addedToStage() {
            Laya.stage.on(Laya.Event.MOUSE_DOWN, this, this.__stageMouseDown);
            Laya.stage.on(Laya.Event.MOUSE_UP, this, this.__stageMouseUp);
            this._modalLayer = new fgui.GGraph();
            this._modalLayer.setSize(this.width, this.height);
            this._modalLayer.drawRect(0, null, fgui.UIConfig.modalLayerColor);
            this._modalLayer.addRelation(this, fgui.RelationType.Size);
            this.displayObject.stage.on(Laya.Event.RESIZE, this, this.__winResize);
            this.__winResize();
        }
        checkPopups(clickTarget) {
            if (this._checkPopups)
                return;
            this._checkPopups = true;
            this._justClosedPopups.length = 0;
            if (this._popupStack.length > 0) {
                var mc = clickTarget;
                while (mc != this.displayObject.stage && mc != null) {
                    if (mc["$owner"]) {
                        var pindex = this._popupStack.indexOf(mc["$owner"]);
                        if (pindex != -1) {
                            for (var i = this._popupStack.length - 1; i > pindex; i--) {
                                var popup = this._popupStack.pop();
                                this.closePopup(popup);
                                this._justClosedPopups.push(popup);
                            }
                            return;
                        }
                    }
                    mc = mc.parent;
                }
                var cnt = this._popupStack.length;
                for (i = cnt - 1; i >= 0; i--) {
                    popup = this._popupStack[i];
                    this.closePopup(popup);
                    this._justClosedPopups.push(popup);
                }
                this._popupStack.length = 0;
            }
        }
        __stageMouseDown(evt) {
            var mc = evt.target;
            while (mc != this.displayObject.stage && mc != null) {
                if (mc["$owner"]) {
                    var gg = mc["$owner"];
                    if (gg.touchable && gg.focusable) {
                        this.setFocus(gg);
                        break;
                    }
                }
                mc = mc.parent;
            }
            if (this._tooltipWin != null)
                this.hideTooltips();
            this.checkPopups(evt.target);
        }
        __stageMouseUp() {
            this._checkPopups = false;
        }
        __winResize() {
            this.setSize(Laya.stage.width, Laya.stage.height);
            this.updateContentScaleLevel();
        }
        updateContentScaleLevel() {
            var mat = Laya.stage._canvasTransform;
            var ss = Math.max(mat.getScaleX(), mat.getScaleY());
            if (ss >= 3.5)
                GRoot.contentScaleLevel = 3;
            else if (ss >= 2.5)
                GRoot.contentScaleLevel = 2;
            else if (ss >= 1.5)
                GRoot.contentScaleLevel = 1;
            else
                GRoot.contentScaleLevel = 0;
        }
    }
    GRoot.contentScaleLevel = 0;
    fgui.GRoot = GRoot;
})(fgui || (fgui = {}));

(function (fgui) {
    class GScrollBar extends fgui.GComponent {
        constructor() {
            super();
            this._dragOffset = new Laya.Point();
            this._scrollPerc = 0;
        }
        setScrollPane(target, vertical) {
            this._target = target;
            this._vertical = vertical;
        }
        setDisplayPerc(value) {
            if (this._vertical) {
                if (!this._fixedGripSize)
                    this._grip.height = Math.floor(value * this._bar.height);
                this._grip.y = this._bar.y + (this._bar.height - this._grip.height) * this._scrollPerc;
            }
            else {
                if (!this._fixedGripSize)
                    this._grip.width = Math.floor(value * this._bar.width);
                this._grip.x = this._bar.x + (this._bar.width - this._grip.width) * this._scrollPerc;
            }
            this._grip.visible = value != 0 && value != 1;
        }
        setScrollPerc(val) {
            this._scrollPerc = val;
            if (this._vertical)
                this._grip.y = this._bar.y + (this._bar.height - this._grip.height) * this._scrollPerc;
            else
                this._grip.x = this._bar.x + (this._bar.width - this._grip.width) * this._scrollPerc;
        }
        get minSize() {
            if (this._vertical)
                return (this._arrowButton1 != null ? this._arrowButton1.height : 0) + (this._arrowButton2 != null ? this._arrowButton2.height : 0);
            else
                return (this._arrowButton1 != null ? this._arrowButton1.width : 0) + (this._arrowButton2 != null ? this._arrowButton2.width : 0);
        }
        get gripDragging() {
            return this._gripDragging;
        }
        constructExtension(buffer) {
            buffer.seek(0, 6);
            this._fixedGripSize = buffer.readBool();
            this._grip = this.getChild("grip");
            if (!this._grip) {
                Laya.Log.print("需要定义grip");
                return;
            }
            this._bar = this.getChild("bar");
            if (!this._bar) {
                Laya.Log.print("需要定义bar");
                return;
            }
            this._arrowButton1 = this.getChild("arrow1");
            this._arrowButton2 = this.getChild("arrow2");
            this._grip.on(Laya.Event.MOUSE_DOWN, this, this.__gripMouseDown);
            if (this._arrowButton1)
                this._arrowButton1.on(Laya.Event.MOUSE_DOWN, this, this.__arrowButton1Click);
            if (this._arrowButton2)
                this._arrowButton2.on(Laya.Event.MOUSE_DOWN, this, this.__arrowButton2Click);
            this.on(Laya.Event.MOUSE_DOWN, this, this.__barMouseDown);
        }
        __gripMouseDown(evt) {
            evt.stopPropagation();
            this._gripDragging = true;
            this._target.updateScrollBarVisible();
            Laya.stage.on(Laya.Event.MOUSE_MOVE, this, this.__gripMouseMove);
            Laya.stage.on(Laya.Event.MOUSE_UP, this, this.__gripMouseUp);
            this.globalToLocal(Laya.stage.mouseX, Laya.stage.mouseY, this._dragOffset);
            this._dragOffset.x -= this._grip.x;
            this._dragOffset.y -= this._grip.y;
        }
        __gripMouseMove() {
            if (!this.onStage)
                return;
            var pt = this.globalToLocal(Laya.stage.mouseX, Laya.stage.mouseY, GScrollBar.sScrollbarHelperPoint);
            if (this._vertical) {
                var curY = pt.y - this._dragOffset.y;
                this._target.setPercY((curY - this._bar.y) / (this._bar.height - this._grip.height), false);
            }
            else {
                var curX = pt.x - this._dragOffset.x;
                this._target.setPercX((curX - this._bar.x) / (this._bar.width - this._grip.width), false);
            }
        }
        __gripMouseUp(evt) {
            if (!this.onStage)
                return;
            Laya.stage.off(Laya.Event.MOUSE_MOVE, this, this.__gripMouseMove);
            Laya.stage.off(Laya.Event.MOUSE_UP, this, this.__gripMouseUp);
            this._gripDragging = false;
            this._target.updateScrollBarVisible();
        }
        __arrowButton1Click(evt) {
            evt.stopPropagation();
            if (this._vertical)
                this._target.scrollUp();
            else
                this._target.scrollLeft();
        }
        __arrowButton2Click(evt) {
            evt.stopPropagation();
            if (this._vertical)
                this._target.scrollDown();
            else
                this._target.scrollRight();
        }
        __barMouseDown(evt) {
            var pt = this._grip.globalToLocal(Laya.stage.mouseX, Laya.stage.mouseY, GScrollBar.sScrollbarHelperPoint);
            if (this._vertical) {
                if (pt.y < 0)
                    this._target.scrollUp(4);
                else
                    this._target.scrollDown(4);
            }
            else {
                if (pt.x < 0)
                    this._target.scrollLeft(4);
                else
                    this._target.scrollRight(4);
            }
        }
    }
    GScrollBar.sScrollbarHelperPoint = new Laya.Point();
    fgui.GScrollBar = GScrollBar;
})(fgui || (fgui = {}));

(function (fgui) {
    class GSlider extends fgui.GComponent {
        constructor() {
            super();
            this._min = 0;
            this._max = 0;
            this._value = 0;
            this._barMaxWidth = 0;
            this._barMaxHeight = 0;
            this._barMaxWidthDelta = 0;
            this._barMaxHeightDelta = 0;
            this._clickPercent = 0;
            this._barStartX = 0;
            this._barStartY = 0;
            this.changeOnClick = true;
            this.canDrag = true;
            this._titleType = fgui.ProgressTitleType.Percent;
            this._value = 50;
            this._max = 100;
            this._clickPos = new Laya.Point();
        }
        get titleType() {
            return this._titleType;
        }
        set titleType(value) {
            this._titleType = value;
        }
        get wholeNumbers() {
            return this._wholeNumbers;
        }
        set wholeNumbers(value) {
            if (this._wholeNumbers != value) {
                this._wholeNumbers = value;
                this.update();
            }
        }
        get min() {
            return this._min;
        }
        set min(value) {
            if (this._min != value) {
                this._min = value;
                this.update();
            }
        }
        get max() {
            return this._max;
        }
        set max(value) {
            if (this._max != value) {
                this._max = value;
                this.update();
            }
        }
        get value() {
            return this._value;
        }
        set value(value) {
            if (this._value != value) {
                this._value = value;
                this.update();
            }
        }
        update() {
            this.updateWithPercent((this._value - this._min) / (this._max - this._min));
        }
        updateWithPercent(percent, evt) {
            percent = fgui.ToolSet.clamp01(percent);
            if (evt) {
                var newValue = fgui.ToolSet.clamp(this._min + (this._max - this._min) * percent, this._min, this._max);
                if (this._wholeNumbers) {
                    newValue = Math.round(newValue);
                    percent = fgui.ToolSet.clamp01((newValue - this._min) / (this._max - this._min));
                }
                if (newValue != this._value) {
                    this._value = newValue;
                    fgui.Events.dispatch(fgui.Events.STATE_CHANGED, this.displayObject, evt);
                }
            }
            if (this._titleObject) {
                switch (this._titleType) {
                    case fgui.ProgressTitleType.Percent:
                        this._titleObject.text = Math.floor(percent * 100) + "%";
                        break;
                    case fgui.ProgressTitleType.ValueAndMax:
                        this._titleObject.text = this._value + "/" + this._max;
                        break;
                    case fgui.ProgressTitleType.Value:
                        this._titleObject.text = "" + this._value;
                        break;
                    case fgui.ProgressTitleType.Max:
                        this._titleObject.text = "" + this._max;
                        break;
                }
            }
            var fullWidth = this.width - this._barMaxWidthDelta;
            var fullHeight = this.height - this._barMaxHeightDelta;
            if (!this._reverse) {
                if (this._barObjectH)
                    this._barObjectH.width = Math.round(fullWidth * percent);
                if (this._barObjectV)
                    this._barObjectV.height = Math.round(fullHeight * percent);
            }
            else {
                if (this._barObjectH) {
                    this._barObjectH.width = Math.round(fullWidth * percent);
                    this._barObjectH.x = this._barStartX + (fullWidth - this._barObjectH.width);
                }
                if (this._barObjectV) {
                    this._barObjectV.height = Math.round(fullHeight * percent);
                    this._barObjectV.y = this._barStartY + (fullHeight - this._barObjectV.height);
                }
            }
        }
        constructExtension(buffer) {
            buffer.seek(0, 6);
            this._titleType = buffer.readByte();
            this._reverse = buffer.readBool();
            if (buffer.version >= 2) {
                this._wholeNumbers = buffer.readBool();
                this.changeOnClick = buffer.readBool();
            }
            this._titleObject = this.getChild("title");
            this._barObjectH = this.getChild("bar");
            this._barObjectV = this.getChild("bar_v");
            this._gripObject = this.getChild("grip");
            if (this._barObjectH) {
                this._barMaxWidth = this._barObjectH.width;
                this._barMaxWidthDelta = this.width - this._barMaxWidth;
                this._barStartX = this._barObjectH.x;
            }
            if (this._barObjectV) {
                this._barMaxHeight = this._barObjectV.height;
                this._barMaxHeightDelta = this.height - this._barMaxHeight;
                this._barStartY = this._barObjectV.y;
            }
            if (this._gripObject) {
                this._gripObject.on(Laya.Event.MOUSE_DOWN, this, this.__gripMouseDown);
            }
            this.displayObject.on(Laya.Event.MOUSE_DOWN, this, this.__barMouseDown);
        }
        handleSizeChanged() {
            super.handleSizeChanged();
            if (this._barObjectH)
                this._barMaxWidth = this.width - this._barMaxWidthDelta;
            if (this._barObjectV)
                this._barMaxHeight = this.height - this._barMaxHeightDelta;
            if (!this._underConstruct)
                this.update();
        }
        setup_afterAdd(buffer, beginPos) {
            super.setup_afterAdd(buffer, beginPos);
            if (!buffer.seek(beginPos, 6)) {
                this.update();
                return;
            }
            if (buffer.readByte() != this.packageItem.objectType) {
                this.update();
                return;
            }
            this._value = buffer.getInt32();
            this._max = buffer.getInt32();
            if (buffer.version >= 2)
                this._min = buffer.getInt32();
            this.update();
        }
        __gripMouseDown(evt) {
            this.canDrag = true;
            evt.stopPropagation();
            this._clickPos = this.globalToLocal(Laya.stage.mouseX, Laya.stage.mouseY);
            this._clickPercent = fgui.ToolSet.clamp01((this._value - this._min) / (this._max - this._min));
            Laya.stage.on(Laya.Event.MOUSE_MOVE, this, this.__gripMouseMove);
            Laya.stage.on(Laya.Event.MOUSE_UP, this, this.__gripMouseUp);
        }
        __gripMouseMove(evt) {
            if (!this.canDrag) {
                return;
            }
            var pt = this.globalToLocal(Laya.stage.mouseX, Laya.stage.mouseY, GSlider.sSilderHelperPoint);
            var deltaX = pt.x - this._clickPos.x;
            var deltaY = pt.y - this._clickPos.y;
            if (this._reverse) {
                deltaX = -deltaX;
                deltaY = -deltaY;
            }
            var percent;
            if (this._barObjectH)
                percent = this._clickPercent + deltaX / this._barMaxWidth;
            else
                percent = this._clickPercent + deltaY / this._barMaxHeight;
            this.updateWithPercent(percent, evt);
        }
        __gripMouseUp(evt) {
            Laya.stage.off(Laya.Event.MOUSE_MOVE, this, this.__gripMouseMove);
            Laya.stage.off(Laya.Event.MOUSE_UP, this, this.__gripMouseUp);
        }
        __barMouseDown(evt) {
            if (!this.changeOnClick)
                return;
            var pt = this._gripObject.globalToLocal(evt.stageX, evt.stageY, GSlider.sSilderHelperPoint);
            var percent = fgui.ToolSet.clamp01((this._value - this._min) / (this._max - this._min));
            var delta;
            if (this._barObjectH)
                delta = pt.x / this._barMaxWidth;
            if (this._barObjectV)
                delta = pt.y / this._barMaxHeight;
            if (this._reverse)
                percent -= delta;
            else
                percent += delta;
            this.updateWithPercent(percent, evt);
        }
    }
    GSlider.sSilderHelperPoint = new Laya.Point();
    fgui.GSlider = GSlider;
})(fgui || (fgui = {}));

(function (fgui) {
    class GTextInput extends fgui.GTextField {
        constructor() {
            super();
        }
        createDisplayObject() {
            this._displayObject = this._input = new Laya.Input();
            this._displayObject.mouseEnabled = true;
            this._displayObject["$owner"] = this;
        }
        get nativeInput() {
            return this._input;
        }
        set text(value) {
            this._input.text = value;
        }
        get text() {
            return this._input.text;
        }
        get font() {
            return this._input.font;
        }
        set font(value) {
            this._input.font = value;
        }
        get fontSize() {
            return this._input.fontSize;
        }
        set fontSize(value) {
            this._input.fontSize = value;
        }
        get color() {
            return this._input.color;
        }
        set color(value) {
            this._input.color = value;
        }
        get align() {
            return this._input.align;
        }
        set align(value) {
            this._input.align = value;
        }
        get valign() {
            return this._input.valign;
        }
        set valign(value) {
            this._input.valign = value;
        }
        get leading() {
            return this._input.leading;
        }
        set leading(value) {
            this._input.leading = value;
        }
        get bold() {
            return this._input.bold;
        }
        set bold(value) {
            this._input.bold = value;
        }
        get italic() {
            return this._input.italic;
        }
        set italic(value) {
            this._input.italic = value;
        }
        get singleLine() {
            return !this._input.multiline;
        }
        set singleLine(value) {
            this._input.multiline = !value;
        }
        get stroke() {
            return this._input.stroke;
        }
        set stroke(value) {
            this._input.stroke = value;
        }
        get strokeColor() {
            return this._input.strokeColor;
        }
        set strokeColor(value) {
            this._input.strokeColor = value;
            this.updateGear(4);
        }
        get password() {
            return this._input.type == "password";
        }
        set password(value) {
            if (value)
                this._input.type = "password";
            else
                this._input.type = "text";
        }
        get keyboardType() {
            return this._input.type;
        }
        set keyboardType(value) {
            this._input.type = value;
        }
        set editable(value) {
            this._input.editable = value;
        }
        get editable() {
            return this._input.editable;
        }
        set maxLength(value) {
            this._input.maxChars = value;
        }
        get maxLength() {
            return this._input.maxChars;
        }
        set promptText(value) {
            this._prompt = value;
            var str = fgui.ToolSet.removeUBB(value);
            this._input.prompt = str;
            if (fgui.ToolSet.defaultUBBParser.lastColor)
                this._input.promptColor = fgui.ToolSet.defaultUBBParser.lastColor;
        }
        get promptText() {
            return this._prompt;
        }
        set restrict(value) {
            this._input.restrict = value;
        }
        get restrict() {
            return this._input.restrict;
        }
        get textWidth() {
            return this._input.textWidth;
        }
        handleSizeChanged() {
            this._input.size(this._width, this._height);
        }
        setup_beforeAdd(buffer, beginPos) {
            super.setup_beforeAdd(buffer, beginPos);
            buffer.seek(beginPos, 4);
            var str = buffer.readS();
            if (str != null)
                this.promptText = str;
            str = buffer.readS();
            if (str != null)
                this._input.restrict = str;
            var iv = buffer.getInt32();
            if (iv != 0)
                this._input.maxChars = iv;
            iv = buffer.getInt32();
            if (iv != 0) {
                if (iv == 4)
                    this.keyboardType = Laya.Input.TYPE_NUMBER;
                else if (iv == 3)
                    this.keyboardType = Laya.Input.TYPE_URL;
            }
            if (buffer.readBool())
                this.password = true;
        }
    }
    fgui.GTextInput = GTextInput;
})(fgui || (fgui = {}));

(function (fgui) {
    class GTree extends fgui.GList {
        constructor() {
            super();
            this._indent = 15;
            this._rootNode = new fgui.GTreeNode(true);
            this._rootNode._setTree(this);
            this._rootNode.expanded = true;
        }
        get rootNode() {
            return this._rootNode;
        }
        get indent() {
            return this._indent;
        }
        set indent(value) {
            this._indent = value;
        }
        get clickToExpand() {
            return this._clickToExpand;
        }
        set clickToExpand(value) {
            this._clickToExpand = value;
        }
        getSelectedNode() {
            if (this.selectedIndex != -1)
                return this.getChildAt(this.selectedIndex)._treeNode;
            else
                return null;
        }
        getSelectedNodes(result) {
            if (!result)
                result = new Array();
            GTree.helperIntList.length = 0;
            super.getSelection(GTree.helperIntList);
            var cnt = GTree.helperIntList.length;
            var ret = new Array();
            for (var i = 0; i < cnt; i++) {
                var node = this.getChildAt(GTree.helperIntList[i])._treeNode;
                ret.push(node);
            }
            return ret;
        }
        selectNode(node, scrollItToView) {
            var parentNode = node.parent;
            while (parentNode != null && parentNode != this._rootNode) {
                parentNode.expanded = true;
                parentNode = parentNode.parent;
            }
            if (!node._cell)
                return;
            this.addSelection(this.getChildIndex(node._cell), scrollItToView);
        }
        unselectNode(node) {
            if (!node._cell)
                return;
            this.removeSelection(this.getChildIndex(node._cell));
        }
        expandAll(folderNode) {
            if (!folderNode)
                folderNode = this._rootNode;
            folderNode.expanded = true;
            var cnt = folderNode.numChildren;
            for (var i = 0; i < cnt; i++) {
                var node = folderNode.getChildAt(i);
                if (node.isFolder)
                    this.expandAll(node);
            }
        }
        collapseAll(folderNode) {
            if (!folderNode)
                folderNode = this._rootNode;
            if (folderNode != this._rootNode)
                folderNode.expanded = false;
            var cnt = folderNode.numChildren;
            for (var i = 0; i < cnt; i++) {
                var node = folderNode.getChildAt(i);
                if (node.isFolder)
                    this.collapseAll(node);
            }
        }
        createCell(node) {
            var child = this.getFromPool(node._resURL);
            if (!child)
                throw new Error("cannot create tree node object.");
            child._treeNode = node;
            node._cell = child;
            var indentObj = child.getChild("indent");
            if (indentObj != null)
                indentObj.width = (node.level - 1) * this._indent;
            var cc;
            cc = child.getController("expanded");
            if (cc) {
                cc.on(fgui.Events.STATE_CHANGED, this, this.__expandedStateChanged);
                cc.selectedIndex = node.expanded ? 1 : 0;
            }
            cc = child.getController("leaf");
            if (cc)
                cc.selectedIndex = node.isFolder ? 0 : 1;
            if (node.isFolder)
                child.on(Laya.Event.MOUSE_DOWN, this, this.__cellMouseDown);
            if (this.treeNodeRender)
                this.treeNodeRender.runWith([node, child]);
        }
        _afterInserted(node) {
            if (!node._cell)
                this.createCell(node);
            var index = this.getInsertIndexForNode(node);
            this.addChildAt(node._cell, index);
            if (this.treeNodeRender)
                this.treeNodeRender.runWith([node, node._cell]);
            if (node.isFolder && node.expanded)
                this.checkChildren(node, index);
        }
        getInsertIndexForNode(node) {
            var prevNode = node.getPrevSibling();
            if (prevNode == null)
                prevNode = node.parent;
            var insertIndex = this.getChildIndex(prevNode._cell) + 1;
            var myLevel = node.level;
            var cnt = this.numChildren;
            for (var i = insertIndex; i < cnt; i++) {
                var testNode = this.getChildAt(i)._treeNode;
                if (testNode.level <= myLevel)
                    break;
                insertIndex++;
            }
            return insertIndex;
        }
        _afterRemoved(node) {
            this.removeNode(node);
        }
        _afterExpanded(node) {
            if (node == this._rootNode) {
                this.checkChildren(this._rootNode, 0);
                return;
            }
            if (this.treeNodeWillExpand != null)
                this.treeNodeWillExpand.runWith([node, true]);
            if (node._cell == null)
                return;
            if (this.treeNodeRender)
                this.treeNodeRender.runWith([node, node._cell]);
            var cc = node._cell.getController("expanded");
            if (cc)
                cc.selectedIndex = 1;
            if (node._cell.parent != null)
                this.checkChildren(node, this.getChildIndex(node._cell));
        }
        _afterCollapsed(node) {
            if (node == this._rootNode) {
                this.checkChildren(this._rootNode, 0);
                return;
            }
            if (this.treeNodeWillExpand)
                this.treeNodeWillExpand.runWith([node, false]);
            if (node._cell == null)
                return;
            if (this.treeNodeRender)
                this.treeNodeRender.runWith([node, node._cell]);
            var cc = node._cell.getController("expanded");
            if (cc)
                cc.selectedIndex = 0;
            if (node._cell.parent != null)
                this.hideFolderNode(node);
        }
        _afterMoved(node) {
            var startIndex = this.getChildIndex(node._cell);
            var endIndex;
            if (node.isFolder)
                endIndex = this.getFolderEndIndex(startIndex, node.level);
            else
                endIndex = startIndex + 1;
            var insertIndex = this.getInsertIndexForNode(node);
            var i;
            var cnt = endIndex - startIndex;
            var obj;
            if (insertIndex < startIndex) {
                for (i = 0; i < cnt; i++) {
                    obj = this.getChildAt(startIndex + i);
                    this.setChildIndex(obj, insertIndex + i);
                }
            }
            else {
                for (i = 0; i < cnt; i++) {
                    obj = this.getChildAt(startIndex);
                    this.setChildIndex(obj, insertIndex);
                }
            }
        }
        getFolderEndIndex(startIndex, level) {
            var cnt = this.numChildren;
            for (var i = startIndex + 1; i < cnt; i++) {
                var node = this.getChildAt(i)._treeNode;
                if (node.level <= level)
                    return i;
            }
            return cnt;
        }
        checkChildren(folderNode, index) {
            var cnt = folderNode.numChildren;
            for (var i = 0; i < cnt; i++) {
                index++;
                var node = folderNode.getChildAt(i);
                if (node._cell == null)
                    this.createCell(node);
                if (!node._cell.parent)
                    this.addChildAt(node._cell, index);
                if (node.isFolder && node.expanded)
                    index = this.checkChildren(node, index);
            }
            return index;
        }
        hideFolderNode(folderNode) {
            var cnt = folderNode.numChildren;
            for (var i = 0; i < cnt; i++) {
                var node = folderNode.getChildAt(i);
                if (node._cell)
                    this.removeChild(node._cell);
                if (node.isFolder && node.expanded)
                    this.hideFolderNode(node);
            }
        }
        removeNode(node) {
            if (node._cell != null) {
                if (node._cell.parent != null)
                    this.removeChild(node._cell);
                this.returnToPool(node._cell);
                node._cell._treeNode = null;
                node._cell = null;
            }
            if (node.isFolder) {
                var cnt = node.numChildren;
                for (var i = 0; i < cnt; i++) {
                    var node2 = node.getChildAt(i);
                    this.removeNode(node2);
                }
            }
        }
        __cellMouseDown(evt) {
            var node = fgui.GObject.cast(evt.currentTarget)._treeNode;
            this._expandedStatusInEvt = node.expanded;
        }
        __expandedStateChanged(cc) {
            var node = cc.parent._treeNode;
            node.expanded = cc.selectedIndex == 1;
        }
        dispatchItemEvent(item, evt) {
            if (this._clickToExpand != 0) {
                var node = item._treeNode;
                if (node && node.isFolder && this._expandedStatusInEvt == node.expanded) {
                    if (this._clickToExpand == 2) {
                    }
                    else
                        node.expanded = !node.expanded;
                }
            }
            super.dispatchItemEvent(item, evt);
        }
        setup_beforeAdd(buffer, beginPos) {
            super.setup_beforeAdd(buffer, beginPos);
            buffer.seek(beginPos, 9);
            this._indent = buffer.getInt32();
            this._clickToExpand = buffer.getUint8();
        }
        readItems(buffer) {
            var cnt;
            var i;
            var nextPos;
            var str;
            var isFolder;
            var lastNode;
            var level;
            var prevLevel = 0;
            cnt = buffer.getInt16();
            for (i = 0; i < cnt; i++) {
                nextPos = buffer.getInt16();
                nextPos += buffer.pos;
                str = buffer.readS();
                if (str == null) {
                    str = this.defaultItem;
                    if (!str) {
                        buffer.pos = nextPos;
                        continue;
                    }
                }
                isFolder = buffer.readBool();
                level = buffer.getUint8();
                var node = new fgui.GTreeNode(isFolder, str);
                node.expanded = true;
                if (i == 0)
                    this._rootNode.addChild(node);
                else {
                    if (level > prevLevel)
                        lastNode.addChild(node);
                    else if (level < prevLevel) {
                        for (var j = level; j <= prevLevel; j++)
                            lastNode = lastNode.parent;
                        lastNode.addChild(node);
                    }
                    else
                        lastNode.parent.addChild(node);
                }
                lastNode = node;
                prevLevel = level;
                this.setupItem(buffer, node.cell);
                buffer.pos = nextPos;
            }
        }
    }
    GTree.helperIntList = new Array();
    fgui.GTree = GTree;
})(fgui || (fgui = {}));

(function (fgui) {
    class GTreeNode {
        constructor(hasChild, resURL) {
            this._level = 0;
            this._resURL = resURL;
            if (hasChild)
                this._children = new Array();
        }
        set expanded(value) {
            if (this._children == null)
                return;
            if (this._expanded != value) {
                this._expanded = value;
                if (this._tree != null) {
                    if (this._expanded)
                        this._tree._afterExpanded(this);
                    else
                        this._tree._afterCollapsed(this);
                }
            }
        }
        get expanded() {
            return this._expanded;
        }
        get isFolder() {
            return this._children != null;
        }
        get parent() {
            return this._parent;
        }
        get text() {
            if (this._cell != null)
                return this._cell.text;
            else
                return null;
        }
        get cell() {
            return this._cell;
        }
        get level() {
            return this._level;
        }
        _setLevel(value) {
            this._level = value;
        }
        addChild(child) {
            this.addChildAt(child, this._children.length);
            return child;
        }
        addChildAt(child, index) {
            if (!child)
                throw new Error("child is null");
            var numChildren = this._children.length;
            if (index >= 0 && index <= numChildren) {
                if (child._parent == this) {
                    this.setChildIndex(child, index);
                }
                else {
                    if (child._parent)
                        child._parent.removeChild(child);
                    var cnt = this._children.length;
                    if (index == cnt)
                        this._children.push(child);
                    else
                        this._children.splice(index, 0, child);
                    child._parent = this;
                    child._level = this._level + 1;
                    child._setTree(this._tree);
                    if (this._tree != null && this == this._tree.rootNode || this._cell != null && this._cell.parent != null && this._expanded)
                        this._tree._afterInserted(child);
                }
                return child;
            }
            else {
                throw new RangeError("Invalid child index");
            }
        }
        removeChild(child) {
            var childIndex = this._children.indexOf(child);
            if (childIndex != -1) {
                this.removeChildAt(childIndex);
            }
            return child;
        }
        removeChildAt(index) {
            if (index >= 0 && index < this.numChildren) {
                var child = this._children[index];
                this._children.splice(index, 1);
                child._parent = null;
                if (this._tree != null) {
                    child._setTree(null);
                    this._tree._afterRemoved(child);
                }
                return child;
            }
            else {
                throw "Invalid child index";
            }
        }
        removeChildren(beginIndex = 0, endIndex = -1) {
            if (endIndex < 0 || endIndex >= this.numChildren)
                endIndex = this.numChildren - 1;
            for (var i = beginIndex; i <= endIndex; ++i)
                this.removeChildAt(beginIndex);
        }
        getChildAt(index) {
            if (index >= 0 && index < this.numChildren)
                return this._children[index];
            else
                throw "Invalid child index";
        }
        getChildIndex(child) {
            return this._children.indexOf(child);
        }
        getPrevSibling() {
            if (this._parent == null)
                return null;
            var i = this._parent._children.indexOf(this);
            if (i <= 0)
                return null;
            return this._parent._children[i - 1];
        }
        getNextSibling() {
            if (this._parent == null)
                return null;
            var i = this._parent._children.indexOf(this);
            if (i < 0 || i >= this._parent._children.length - 1)
                return null;
            return this._parent._children[i + 1];
        }
        setChildIndex(child, index) {
            var oldIndex = this._children.indexOf(child);
            if (oldIndex == -1)
                throw "Not a child of this container";
            var cnt = this._children.length;
            if (index < 0)
                index = 0;
            else if (index > cnt)
                index = cnt;
            if (oldIndex == index)
                return;
            this._children.splice(oldIndex, 1);
            this._children.splice(index, 0, child);
            if (this._tree != null && this == this._tree.rootNode || this._cell != null && this._cell.parent != null && this._expanded)
                this._tree._afterMoved(child);
        }
        swapChildren(child1, child2) {
            var index1 = this._children.indexOf(child1);
            var index2 = this._children.indexOf(child2);
            if (index1 == -1 || index2 == -1)
                throw "Not a child of this container";
            this.swapChildrenAt(index1, index2);
        }
        swapChildrenAt(index1, index2) {
            var child1 = this._children[index1];
            var child2 = this._children[index2];
            this.setChildIndex(child1, index2);
            this.setChildIndex(child2, index1);
        }
        get numChildren() {
            return this._children.length;
        }
        expandToRoot() {
            var p = this;
            while (p) {
                p.expanded = true;
                p = p.parent;
            }
        }
        get tree() {
            return this._tree;
        }
        _setTree(value) {
            this._tree = value;
            if (this._tree != null && this._tree.treeNodeWillExpand && this._expanded)
                this._tree.treeNodeWillExpand.runWith([this, true]);
            if (this._children != null) {
                var cnt = this._children.length;
                for (var i = 0; i < cnt; i++) {
                    var node = this._children[i];
                    node._level = this._level + 1;
                    node._setTree(value);
                }
            }
        }
    }
    fgui.GTreeNode = GTreeNode;
})(fgui || (fgui = {}));

(function (fgui) {
    class PackageItem {
        constructor() {
            this.width = 0;
            this.height = 0;
            this.tileGridIndice = 0;
            this.interval = 0;
            this.repeatDelay = 0;
        }
        load() {
            return this.owner.getItemAsset(this);
        }
        getBranch() {
            if (this.branches && this.owner._branchIndex != -1) {
                var itemId = this.branches[this.owner._branchIndex];
                if (itemId)
                    return this.owner.getItemById(itemId);
            }
            return this;
        }
        getHighResolution() {
            if (this.highResolution && fgui.GRoot.contentScaleLevel > 0) {
                var itemId = this.highResolution[fgui.GRoot.contentScaleLevel - 1];
                if (itemId)
                    return this.owner.getItemById(itemId);
            }
            return this;
        }
        toString() {
            return this.name;
        }
    }
    fgui.PackageItem = PackageItem;
})(fgui || (fgui = {}));

(function (fgui) {
    class PopupMenu {
        constructor(resourceURL = null) {
            if (!resourceURL) {
                resourceURL = fgui.UIConfig.popupMenu;
                if (!resourceURL)
                    throw "UIConfig.popupMenu not defined";
            }
            this._contentPane = fgui.UIPackage.createObjectFromURL(resourceURL).asCom;
            this._contentPane.on(Laya.Event.DISPLAY, this, this.__addedToStage);
            this._list = (this._contentPane.getChild("list"));
            this._list.removeChildrenToPool();
            this._list.addRelation(this._contentPane, fgui.RelationType.Width);
            this._list.removeRelation(this._contentPane, fgui.RelationType.Height);
            this._contentPane.addRelation(this._list, fgui.RelationType.Height);
            this._list.on(fgui.Events.CLICK_ITEM, this, this.__clickItem);
        }
        dispose() {
            this._contentPane.dispose();
        }
        addItem(caption, handler = null) {
            var item = this._list.addItemFromPool().asButton;
            item.title = caption;
            item.data = handler;
            item.grayed = false;
            var c = item.getController("checked");
            if (c != null)
                c.selectedIndex = 0;
            return item;
        }
        addItemAt(caption, index, handler = null) {
            var item = this._list.getFromPool().asButton;
            this._list.addChildAt(item, index);
            item.title = caption;
            item.data = handler;
            item.grayed = false;
            var c = item.getController("checked");
            if (c != null)
                c.selectedIndex = 0;
            return item;
        }
        addSeperator() {
            if (fgui.UIConfig.popupMenu_seperator == null)
                throw "UIConfig.popupMenu_seperator not defined";
            this.list.addItemFromPool(fgui.UIConfig.popupMenu_seperator);
        }
        getItemName(index) {
            var item = this._list.getChildAt(index);
            return item.name;
        }
        setItemText(name, caption) {
            var item = this._list.getChild(name).asButton;
            item.title = caption;
        }
        setItemVisible(name, visible) {
            var item = this._list.getChild(name).asButton;
            if (item.visible != visible) {
                item.visible = visible;
                this._list.setBoundsChangedFlag();
            }
        }
        setItemGrayed(name, grayed) {
            var item = this._list.getChild(name).asButton;
            item.grayed = grayed;
        }
        setItemCheckable(name, checkable) {
            var item = this._list.getChild(name).asButton;
            var c = item.getController("checked");
            if (c != null) {
                if (checkable) {
                    if (c.selectedIndex == 0)
                        c.selectedIndex = 1;
                }
                else
                    c.selectedIndex = 0;
            }
        }
        setItemChecked(name, checked) {
            var item = this._list.getChild(name).asButton;
            var c = item.getController("checked");
            if (c != null)
                c.selectedIndex = checked ? 2 : 1;
        }
        isItemChecked(name) {
            var item = this._list.getChild(name).asButton;
            var c = item.getController("checked");
            if (c != null)
                return c.selectedIndex == 2;
            else
                return false;
        }
        removeItem(name) {
            var item = this._list.getChild(name);
            if (item != null) {
                var index = this._list.getChildIndex(item);
                this._list.removeChildToPoolAt(index);
                return true;
            }
            else
                return false;
        }
        clearItems() {
            this._list.removeChildrenToPool();
        }
        get itemCount() {
            return this._list.numChildren;
        }
        get contentPane() {
            return this._contentPane;
        }
        get list() {
            return this._list;
        }
        show(target = null, downward = null) {
            var r = target != null ? target.root : fgui.GRoot.inst;
            r.showPopup(this.contentPane, (target instanceof fgui.GRoot) ? null : target, downward);
        }
        __clickItem(itemObject) {
            Laya.timer.once(100, this, this.__clickItem2, [itemObject]);
        }
        __clickItem2(itemObject) {
            if (!(itemObject instanceof fgui.GButton))
                return;
            if (itemObject.grayed) {
                this._list.selectedIndex = -1;
                return;
            }
            var c = itemObject.asCom.getController("checked");
            if (c != null && c.selectedIndex != 0) {
                if (c.selectedIndex == 1)
                    c.selectedIndex = 2;
                else
                    c.selectedIndex = 1;
            }
            var r = (this._contentPane.parent);
            r.hidePopup(this.contentPane);
            if (itemObject.data != null) {
                itemObject.data.run();
            }
        }
        __addedToStage() {
            this._list.selectedIndex = -1;
            this._list.resizeToFit(100000, 10);
        }
    }
    fgui.PopupMenu = PopupMenu;
})(fgui || (fgui = {}));

(function (fgui) {
    class RelationItem {
        constructor(owner) {
            this._owner = owner;
            this._defs = new Array();
        }
        get owner() {
            return this._owner;
        }
        set target(value) {
            if (this._target != value) {
                if (this._target)
                    this.releaseRefTarget();
                this._target = value;
                if (this._target)
                    this.addRefTarget();
            }
        }
        get target() {
            return this._target;
        }
        add(relationType, usePercent) {
            if (relationType == fgui.RelationType.Size) {
                this.add(fgui.RelationType.Width, usePercent);
                this.add(fgui.RelationType.Height, usePercent);
                return;
            }
            var cnt = this._defs.length;
            for (var i = 0; i < cnt; i++) {
                if (this._defs[i].type == relationType)
                    return;
            }
            this.internalAdd(relationType, usePercent);
        }
        internalAdd(relationType, usePercent) {
            if (relationType == fgui.RelationType.Size) {
                this.internalAdd(fgui.RelationType.Width, usePercent);
                this.internalAdd(fgui.RelationType.Height, usePercent);
                return;
            }
            var info = new RelationDef();
            info.percent = usePercent;
            info.type = relationType;
            info.axis = (relationType <= fgui.RelationType.Right_Right || relationType == fgui.RelationType.Width || relationType >= fgui.RelationType.LeftExt_Left && relationType <= fgui.RelationType.RightExt_Right) ? 0 : 1;
            this._defs.push(info);
            if (usePercent || relationType == fgui.RelationType.Left_Center || relationType == fgui.RelationType.Center_Center || relationType == fgui.RelationType.Right_Center
                || relationType == fgui.RelationType.Top_Middle || relationType == fgui.RelationType.Middle_Middle || relationType == fgui.RelationType.Bottom_Middle)
                this._owner.pixelSnapping = true;
        }
        remove(relationType) {
            if (relationType == fgui.RelationType.Size) {
                this.remove(fgui.RelationType.Width);
                this.remove(fgui.RelationType.Height);
                return;
            }
            var dc = this._defs.length;
            for (var k = 0; k < dc; k++) {
                if (this._defs[k].type == relationType) {
                    this._defs.splice(k, 1);
                    break;
                }
            }
        }
        copyFrom(source) {
            this._target = source.target;
            this._defs.length = 0;
            var cnt = source._defs.length;
            for (var i = 0; i < cnt; i++) {
                var info = source._defs[i];
                var info2 = new RelationDef();
                info2.copyFrom(info);
                this._defs.push(info2);
            }
        }
        dispose() {
            if (this._target != null) {
                this.releaseRefTarget();
                this._target = null;
            }
        }
        get isEmpty() {
            return this._defs.length == 0;
        }
        applyOnSelfResized(dWidth, dHeight, applyPivot) {
            var cnt = this._defs.length;
            if (cnt == 0)
                return;
            var ox = this._owner.x;
            var oy = this._owner.y;
            for (var i = 0; i < cnt; i++) {
                var info = this._defs[i];
                switch (info.type) {
                    case fgui.RelationType.Center_Center:
                        this._owner.x -= (0.5 - (applyPivot ? this._owner.pivotX : 0)) * dWidth;
                        break;
                    case fgui.RelationType.Right_Center:
                    case fgui.RelationType.Right_Left:
                    case fgui.RelationType.Right_Right:
                        this._owner.x -= (1 - (applyPivot ? this._owner.pivotX : 0)) * dWidth;
                        break;
                    case fgui.RelationType.Middle_Middle:
                        this._owner.y -= (0.5 - (applyPivot ? this._owner.pivotY : 0)) * dHeight;
                        break;
                    case fgui.RelationType.Bottom_Middle:
                    case fgui.RelationType.Bottom_Top:
                    case fgui.RelationType.Bottom_Bottom:
                        this._owner.y -= (1 - (applyPivot ? this._owner.pivotY : 0)) * dHeight;
                        break;
                }
            }
            if (ox != this._owner.x || oy != this._owner.y) {
                ox = this._owner.x - ox;
                oy = this._owner.y - oy;
                this._owner.updateGearFromRelations(1, ox, oy);
                if (this._owner.parent != null && this._owner.parent._transitions.length > 0) {
                    cnt = this._owner.parent._transitions.length;
                    for (var j = 0; j < cnt; j++) {
                        var trans = this._owner.parent._transitions[j];
                        trans.updateFromRelations(this._owner.id, ox, oy);
                    }
                }
            }
        }
        applyOnXYChanged(info, dx, dy) {
            var tmp;
            switch (info.type) {
                case fgui.RelationType.Left_Left:
                case fgui.RelationType.Left_Center:
                case fgui.RelationType.Left_Right:
                case fgui.RelationType.Center_Center:
                case fgui.RelationType.Right_Left:
                case fgui.RelationType.Right_Center:
                case fgui.RelationType.Right_Right:
                    this._owner.x += dx;
                    break;
                case fgui.RelationType.Top_Top:
                case fgui.RelationType.Top_Middle:
                case fgui.RelationType.Top_Bottom:
                case fgui.RelationType.Middle_Middle:
                case fgui.RelationType.Bottom_Top:
                case fgui.RelationType.Bottom_Middle:
                case fgui.RelationType.Bottom_Bottom:
                    this._owner.y += dy;
                    break;
                case fgui.RelationType.Width:
                case fgui.RelationType.Height:
                    break;
                case fgui.RelationType.LeftExt_Left:
                case fgui.RelationType.LeftExt_Right:
                    if (this._owner != this._target.parent) {
                        tmp = this._owner.xMin;
                        this._owner.width = this._owner._rawWidth - dx;
                        this._owner.xMin = tmp + dx;
                    }
                    else
                        this._owner.width = this._owner._rawWidth - dx;
                    break;
                case fgui.RelationType.RightExt_Left:
                case fgui.RelationType.RightExt_Right:
                    if (this._owner != this._target.parent) {
                        tmp = this._owner.xMin;
                        this._owner.width = this._owner._rawWidth + dx;
                        this._owner.xMin = tmp;
                    }
                    else
                        this._owner.width = this._owner._rawWidth + dx;
                    break;
                case fgui.RelationType.TopExt_Top:
                case fgui.RelationType.TopExt_Bottom:
                    if (this._owner != this._target.parent) {
                        tmp = this._owner.yMin;
                        this._owner.height = this._owner._rawHeight - dy;
                        this._owner.yMin = tmp + dy;
                    }
                    else
                        this._owner.height = this._owner._rawHeight - dy;
                    break;
                case fgui.RelationType.BottomExt_Top:
                case fgui.RelationType.BottomExt_Bottom:
                    if (this._owner != this._target.parent) {
                        tmp = this._owner.yMin;
                        this._owner.height = this._owner._rawHeight + dy;
                        this._owner.yMin = tmp;
                    }
                    else
                        this._owner.height = this._owner._rawHeight + dy;
                    break;
            }
        }
        applyOnSizeChanged(info) {
            var pos = 0, pivot = 0, delta = 0;
            var v, tmp;
            if (info.axis == 0) {
                if (this._target != this._owner.parent) {
                    pos = this._target.x;
                    if (this._target.pivotAsAnchor)
                        pivot = this._target.pivotX;
                }
                if (info.percent) {
                    if (this._targetWidth != 0)
                        delta = this._target._width / this._targetWidth;
                }
                else
                    delta = this._target._width - this._targetWidth;
            }
            else {
                if (this._target != this._owner.parent) {
                    pos = this._target.y;
                    if (this._target.pivotAsAnchor)
                        pivot = this._target.pivotY;
                }
                if (info.percent) {
                    if (this._targetHeight != 0)
                        delta = this._target._height / this._targetHeight;
                }
                else
                    delta = this._target._height - this._targetHeight;
            }
            switch (info.type) {
                case fgui.RelationType.Left_Left:
                    if (info.percent)
                        this._owner.xMin = pos + (this._owner.xMin - pos) * delta;
                    else if (pivot != 0)
                        this._owner.x += delta * (-pivot);
                    break;
                case fgui.RelationType.Left_Center:
                    if (info.percent)
                        this._owner.xMin = pos + (this._owner.xMin - pos) * delta;
                    else
                        this._owner.x += delta * (0.5 - pivot);
                    break;
                case fgui.RelationType.Left_Right:
                    if (info.percent)
                        this._owner.xMin = pos + (this._owner.xMin - pos) * delta;
                    else
                        this._owner.x += delta * (1 - pivot);
                    break;
                case fgui.RelationType.Center_Center:
                    if (info.percent)
                        this._owner.xMin = pos + (this._owner.xMin + this._owner._rawWidth * 0.5 - pos) * delta - this._owner._rawWidth * 0.5;
                    else
                        this._owner.x += delta * (0.5 - pivot);
                    break;
                case fgui.RelationType.Right_Left:
                    if (info.percent)
                        this._owner.xMin = pos + (this._owner.xMin + this._owner._rawWidth - pos) * delta - this._owner._rawWidth;
                    else if (pivot != 0)
                        this._owner.x += delta * (-pivot);
                    break;
                case fgui.RelationType.Right_Center:
                    if (info.percent)
                        this._owner.xMin = pos + (this._owner.xMin + this._owner._rawWidth - pos) * delta - this._owner._rawWidth;
                    else
                        this._owner.x += delta * (0.5 - pivot);
                    break;
                case fgui.RelationType.Right_Right:
                    if (info.percent)
                        this._owner.xMin = pos + (this._owner.xMin + this._owner._rawWidth - pos) * delta - this._owner._rawWidth;
                    else
                        this._owner.x += delta * (1 - pivot);
                    break;
                case fgui.RelationType.Top_Top:
                    if (info.percent)
                        this._owner.yMin = pos + (this._owner.yMin - pos) * delta;
                    else if (pivot != 0)
                        this._owner.y += delta * (-pivot);
                    break;
                case fgui.RelationType.Top_Middle:
                    if (info.percent)
                        this._owner.yMin = pos + (this._owner.yMin - pos) * delta;
                    else
                        this._owner.y += delta * (0.5 - pivot);
                    break;
                case fgui.RelationType.Top_Bottom:
                    if (info.percent)
                        this._owner.yMin = pos + (this._owner.yMin - pos) * delta;
                    else
                        this._owner.y += delta * (1 - pivot);
                    break;
                case fgui.RelationType.Middle_Middle:
                    if (info.percent)
                        this._owner.yMin = pos + (this._owner.yMin + this._owner._rawHeight * 0.5 - pos) * delta - this._owner._rawHeight * 0.5;
                    else
                        this._owner.y += delta * (0.5 - pivot);
                    break;
                case fgui.RelationType.Bottom_Top:
                    if (info.percent)
                        this._owner.yMin = pos + (this._owner.yMin + this._owner._rawHeight - pos) * delta - this._owner._rawHeight;
                    else if (pivot != 0)
                        this._owner.y += delta * (-pivot);
                    break;
                case fgui.RelationType.Bottom_Middle:
                    if (info.percent)
                        this._owner.yMin = pos + (this._owner.yMin + this._owner._rawHeight - pos) * delta - this._owner._rawHeight;
                    else
                        this._owner.y += delta * (0.5 - pivot);
                    break;
                case fgui.RelationType.Bottom_Bottom:
                    if (info.percent)
                        this._owner.yMin = pos + (this._owner.yMin + this._owner._rawHeight - pos) * delta - this._owner._rawHeight;
                    else
                        this._owner.y += delta * (1 - pivot);
                    break;
                case fgui.RelationType.Width:
                    if (this._owner._underConstruct && this._owner == this._target.parent)
                        v = this._owner.sourceWidth - this._target.initWidth;
                    else
                        v = this._owner._rawWidth - this._targetWidth;
                    if (info.percent)
                        v = v * delta;
                    if (this._target == this._owner.parent) {
                        if (this._owner.pivotAsAnchor) {
                            tmp = this._owner.xMin;
                            this._owner.setSize(this._target._width + v, this._owner._rawHeight, true);
                            this._owner.xMin = tmp;
                        }
                        else
                            this._owner.setSize(this._target._width + v, this._owner._rawHeight, true);
                    }
                    else
                        this._owner.width = this._target._width + v;
                    break;
                case fgui.RelationType.Height:
                    if (this._owner._underConstruct && this._owner == this._target.parent)
                        v = this._owner.sourceHeight - this._target.initHeight;
                    else
                        v = this._owner._rawHeight - this._targetHeight;
                    if (info.percent)
                        v = v * delta;
                    if (this._target == this._owner.parent) {
                        if (this._owner.pivotAsAnchor) {
                            tmp = this._owner.yMin;
                            this._owner.setSize(this._owner._rawWidth, this._target._height + v, true);
                            this._owner.yMin = tmp;
                        }
                        else
                            this._owner.setSize(this._owner._rawWidth, this._target._height + v, true);
                    }
                    else
                        this._owner.height = this._target._height + v;
                    break;
                case fgui.RelationType.LeftExt_Left:
                    tmp = this._owner.xMin;
                    if (info.percent)
                        v = pos + (tmp - pos) * delta - tmp;
                    else
                        v = delta * (-pivot);
                    this._owner.width = this._owner._rawWidth - v;
                    this._owner.xMin = tmp + v;
                    break;
                case fgui.RelationType.LeftExt_Right:
                    tmp = this._owner.xMin;
                    if (info.percent)
                        v = pos + (tmp - pos) * delta - tmp;
                    else
                        v = delta * (1 - pivot);
                    this._owner.width = this._owner._rawWidth - v;
                    this._owner.xMin = tmp + v;
                    break;
                case fgui.RelationType.RightExt_Left:
                    tmp = this._owner.xMin;
                    if (info.percent)
                        v = pos + (tmp + this._owner._rawWidth - pos) * delta - (tmp + this._owner._rawWidth);
                    else
                        v = delta * (-pivot);
                    this._owner.width = this._owner._rawWidth + v;
                    this._owner.xMin = tmp;
                    break;
                case fgui.RelationType.RightExt_Right:
                    tmp = this._owner.xMin;
                    if (info.percent) {
                        if (this._owner == this._target.parent) {
                            if (this._owner._underConstruct)
                                this._owner.width = pos + this._target._width - this._target._width * pivot +
                                    (this._owner.sourceWidth - pos - this._target.initWidth + this._target.initWidth * pivot) * delta;
                            else
                                this._owner.width = pos + (this._owner._rawWidth - pos) * delta;
                        }
                        else {
                            v = pos + (tmp + this._owner._rawWidth - pos) * delta - (tmp + this._owner._rawWidth);
                            this._owner.width = this._owner._rawWidth + v;
                            this._owner.xMin = tmp;
                        }
                    }
                    else {
                        if (this._owner == this._target.parent) {
                            if (this._owner._underConstruct)
                                this._owner.width = this._owner.sourceWidth + (this._target._width - this._target.initWidth) * (1 - pivot);
                            else
                                this._owner.width = this._owner._rawWidth + delta * (1 - pivot);
                        }
                        else {
                            v = delta * (1 - pivot);
                            this._owner.width = this._owner._rawWidth + v;
                            this._owner.xMin = tmp;
                        }
                    }
                    break;
                case fgui.RelationType.TopExt_Top:
                    tmp = this._owner.yMin;
                    if (info.percent)
                        v = pos + (tmp - pos) * delta - tmp;
                    else
                        v = delta * (-pivot);
                    this._owner.height = this._owner._rawHeight - v;
                    this._owner.yMin = tmp + v;
                    break;
                case fgui.RelationType.TopExt_Bottom:
                    tmp = this._owner.yMin;
                    if (info.percent)
                        v = pos + (tmp - pos) * delta - tmp;
                    else
                        v = delta * (1 - pivot);
                    this._owner.height = this._owner._rawHeight - v;
                    this._owner.yMin = tmp + v;
                    break;
                case fgui.RelationType.BottomExt_Top:
                    tmp = this._owner.yMin;
                    if (info.percent)
                        v = pos + (tmp + this._owner._rawHeight - pos) * delta - (tmp + this._owner._rawHeight);
                    else
                        v = delta * (-pivot);
                    this._owner.height = this._owner._rawHeight + v;
                    this._owner.yMin = tmp;
                    break;
                case fgui.RelationType.BottomExt_Bottom:
                    tmp = this._owner.yMin;
                    if (info.percent) {
                        if (this._owner == this._target.parent) {
                            if (this._owner._underConstruct)
                                this._owner.height = pos + this._target._height - this._target._height * pivot +
                                    (this._owner.sourceHeight - pos - this._target.initHeight + this._target.initHeight * pivot) * delta;
                            else
                                this._owner.height = pos + (this._owner._rawHeight - pos) * delta;
                        }
                        else {
                            v = pos + (tmp + this._owner._rawHeight - pos) * delta - (tmp + this._owner._rawHeight);
                            this._owner.height = this._owner._rawHeight + v;
                            this._owner.yMin = tmp;
                        }
                    }
                    else {
                        if (this._owner == this._target.parent) {
                            if (this._owner._underConstruct)
                                this._owner.height = this._owner.sourceHeight + (this._target._height - this._target.initHeight) * (1 - pivot);
                            else
                                this._owner.height = this._owner._rawHeight + delta * (1 - pivot);
                        }
                        else {
                            v = delta * (1 - pivot);
                            this._owner.height = this._owner._rawHeight + v;
                            this._owner.yMin = tmp;
                        }
                    }
                    break;
            }
        }
        addRefTarget() {
            if (this._target != this._owner.parent)
                this._target.on(fgui.Events.XY_CHANGED, this, this.__targetXYChanged);
            this._target.on(fgui.Events.SIZE_CHANGED, this, this.__targetSizeChanged);
            this._target.on(fgui.Events.SIZE_DELAY_CHANGE, this, this.__targetSizeWillChange);
            this._targetX = this._target.x;
            this._targetY = this._target.y;
            this._targetWidth = this._target._width;
            this._targetHeight = this._target._height;
        }
        releaseRefTarget() {
            if (this._target.displayObject == null)
                return;
            this._target.off(fgui.Events.XY_CHANGED, this, this.__targetXYChanged);
            this._target.off(fgui.Events.SIZE_CHANGED, this, this.__targetSizeChanged);
            this._target.off(fgui.Events.SIZE_DELAY_CHANGE, this, this.__targetSizeWillChange);
        }
        __targetXYChanged() {
            if (this._owner.relations.handling != null || this._owner.group != null && this._owner.group._updating) {
                this._targetX = this._target.x;
                this._targetY = this._target.y;
                return;
            }
            this._owner.relations.handling = this._target;
            var ox = this._owner.x;
            var oy = this._owner.y;
            var dx = this._target.x - this._targetX;
            var dy = this._target.y - this._targetY;
            var cnt = this._defs.length;
            for (var i = 0; i < cnt; i++) {
                this.applyOnXYChanged(this._defs[i], dx, dy);
            }
            this._targetX = this._target.x;
            this._targetY = this._target.y;
            if (ox != this._owner.x || oy != this._owner.y) {
                ox = this._owner.x - ox;
                oy = this._owner.y - oy;
                this._owner.updateGearFromRelations(1, ox, oy);
                if (this._owner.parent != null && this._owner.parent._transitions.length > 0) {
                    cnt = this._owner.parent._transitions.length;
                    for (var j = 0; j < cnt; j++) {
                        var trans = this._owner.parent._transitions[j];
                        trans.updateFromRelations(this._owner.id, ox, oy);
                    }
                }
            }
            this._owner.relations.handling = null;
        }
        __targetSizeChanged() {
            if (this._owner.relations.sizeDirty)
                this._owner.relations.ensureRelationsSizeCorrect();
            if (this._owner.relations.handling != null) {
                this._targetWidth = this._target._width;
                this._targetHeight = this._target._height;
                return;
            }
            this._owner.relations.handling = this._target;
            var ox = this._owner.x;
            var oy = this._owner.y;
            var ow = this._owner._rawWidth;
            var oh = this._owner._rawHeight;
            var cnt = this._defs.length;
            for (var i = 0; i < cnt; i++) {
                this.applyOnSizeChanged(this._defs[i]);
            }
            this._targetWidth = this._target._width;
            this._targetHeight = this._target._height;
            if (ox != this._owner.x || oy != this._owner.y) {
                ox = this._owner.x - ox;
                oy = this._owner.y - oy;
                this._owner.updateGearFromRelations(1, ox, oy);
                if (this._owner.parent != null && this._owner.parent._transitions.length > 0) {
                    cnt = this._owner.parent._transitions.length;
                    for (var j = 0; j < cnt; j++) {
                        var trans = this._owner.parent._transitions[j];
                        trans.updateFromRelations(this._owner.id, ox, oy);
                    }
                }
            }
            if (ow != this._owner._rawWidth || oh != this._owner._rawHeight) {
                ow = this._owner._rawWidth - ow;
                oh = this._owner._rawHeight - oh;
                this._owner.updateGearFromRelations(2, ow, oh);
            }
            this._owner.relations.handling = null;
        }
        __targetSizeWillChange() {
            this._owner.relations.sizeDirty = true;
        }
    }
    fgui.RelationItem = RelationItem;
    class RelationDef {
        constructor() {
        }
        copyFrom(source) {
            this.percent = source.percent;
            this.type = source.type;
            this.axis = source.axis;
        }
    }
})(fgui || (fgui = {}));

(function (fgui) {
    class Relations {
        constructor(owner) {
            this._owner = owner;
            this._items = [];
        }
        add(target, relationType, usePercent = false) {
            var length = this._items.length;
            for (var i = 0; i < length; i++) {
                var item = this._items[i];
                if (item.target == target) {
                    item.add(relationType, usePercent);
                    return;
                }
            }
            var newItem = new fgui.RelationItem(this._owner);
            newItem.target = target;
            newItem.add(relationType, usePercent);
            this._items.push(newItem);
        }
        remove(target, relationType = 0) {
            var cnt = this._items.length;
            var i = 0;
            while (i < cnt) {
                var item = this._items[i];
                if (item.target == target) {
                    item.remove(relationType);
                    if (item.isEmpty) {
                        item.dispose();
                        this._items.splice(i, 1);
                        cnt--;
                    }
                    else
                        i++;
                }
                else
                    i++;
            }
        }
        contains(target) {
            var length = this._items.length;
            for (var i = 0; i < length; i++) {
                var item = this._items[i];
                if (item.target == target)
                    return true;
            }
            return false;
        }
        clearFor(target) {
            var cnt = this._items.length;
            var i = 0;
            while (i < cnt) {
                var item = this._items[i];
                if (item.target == target) {
                    item.dispose();
                    this._items.splice(i, 1);
                    cnt--;
                }
                else
                    i++;
            }
        }
        clearAll() {
            var length = this._items.length;
            for (var i = 0; i < length; i++) {
                var item = this._items[i];
                item.dispose();
            }
            this._items.length = 0;
        }
        copyFrom(source) {
            this.clearAll();
            var arr = source._items;
            var length = arr.length;
            for (var i = 0; i < length; i++) {
                var ri = arr[i];
                var item = new fgui.RelationItem(this._owner);
                item.copyFrom(ri);
                this._items.push(item);
            }
        }
        dispose() {
            this.clearAll();
        }
        onOwnerSizeChanged(dWidth, dHeight, applyPivot) {
            if (this._items.length == 0)
                return;
            var length = this._items.length;
            for (var i = 0; i < length; i++) {
                var item = this._items[i];
                item.applyOnSelfResized(dWidth, dHeight, applyPivot);
            }
        }
        ensureRelationsSizeCorrect() {
            if (this._items.length == 0)
                return;
            this.sizeDirty = false;
            var length = this._items.length;
            for (var i = 0; i < length; i++) {
                var item = this._items[i];
                item.target.ensureSizeCorrect();
            }
        }
        get empty() {
            return this._items.length == 0;
        }
        setup(buffer, parentToChild) {
            var cnt = buffer.readByte();
            var target;
            for (var i = 0; i < cnt; i++) {
                var targetIndex = buffer.getInt16();
                if (targetIndex == -1)
                    target = this._owner.parent;
                else if (parentToChild)
                    target = (this._owner).getChildAt(targetIndex);
                else
                    target = this._owner.parent.getChildAt(targetIndex);
                var newItem = new fgui.RelationItem(this._owner);
                newItem.target = target;
                this._items.push(newItem);
                var cnt2 = buffer.readByte();
                for (var j = 0; j < cnt2; j++) {
                    var rt = buffer.readByte();
                    var usePercent = buffer.readBool();
                    newItem.internalAdd(rt, usePercent);
                }
            }
        }
    }
    fgui.Relations = Relations;
})(fgui || (fgui = {}));

(function (fgui) {
    class ScrollPane {
        constructor(owner) {
            this._owner = owner;
            this._maskContainer = new Laya.Sprite();
            this._owner.displayObject.addChild(this._maskContainer);
            this._container = this._owner._container;
            this._container.pos(0, 0);
            this._maskContainer.addChild(this._container);
            this._mouseWheelEnabled = true;
            this._xPos = 0;
            this._yPos = 0;
            this._aniFlag = 0;
            this._tweening = 0;
            this._loop = 0;
            this._footerLockedSize = 0;
            this._headerLockedSize = 0;
            this._scrollBarMargin = new fgui.Margin();
            this._viewSize = new Laya.Point();
            this._contentSize = new Laya.Point();
            this._pageSize = new Laya.Point(1, 1);
            this._overlapSize = new Laya.Point();
            this._tweenTime = new Laya.Point();
            this._tweenStart = new Laya.Point();
            this._tweenDuration = new Laya.Point();
            this._tweenChange = new Laya.Point();
            this._velocity = new Laya.Point();
            this._containerPos = new Laya.Point();
            this._beginTouchPos = new Laya.Point();
            this._lastTouchPos = new Laya.Point();
            this._lastTouchGlobalPos = new Laya.Point();
            this._scrollStep = fgui.UIConfig.defaultScrollStep;
            this._mouseWheelStep = this._scrollStep * 2;
            this._decelerationRate = fgui.UIConfig.defaultScrollDecelerationRate;
            this._owner.on(Laya.Event.MOUSE_DOWN, this, this.__mouseDown);
            this._owner.on(Laya.Event.MOUSE_WHEEL, this, this.__mouseWheel);
        }
        setup(buffer) {
            this._scrollType = buffer.readByte();
            var scrollBarDisplay = buffer.readByte();
            var flags = buffer.getInt32();
            if (buffer.readBool()) {
                this._scrollBarMargin.top = buffer.getInt32();
                this._scrollBarMargin.bottom = buffer.getInt32();
                this._scrollBarMargin.left = buffer.getInt32();
                this._scrollBarMargin.right = buffer.getInt32();
            }
            var vtScrollBarRes = buffer.readS();
            var hzScrollBarRes = buffer.readS();
            var headerRes = buffer.readS();
            var footerRes = buffer.readS();
            this._displayOnLeft = (flags & 1) != 0;
            this._snapToItem = (flags & 2) != 0;
            this._displayInDemand = (flags & 4) != 0;
            this._pageMode = (flags & 8) != 0;
            if (flags & 16)
                this._touchEffect = true;
            else if (flags & 32)
                this._touchEffect = false;
            else
                this._touchEffect = fgui.UIConfig.defaultScrollTouchEffect;
            if (flags & 64)
                this._bouncebackEffect = true;
            else if (flags & 128)
                this._bouncebackEffect = false;
            else
                this._bouncebackEffect = fgui.UIConfig.defaultScrollBounceEffect;
            this._inertiaDisabled = (flags & 256) != 0;
            if ((flags & 512) == 0)
                this._maskContainer.scrollRect = new Laya.Rectangle();
            this._floating = (flags & 1024) != 0;
            if (scrollBarDisplay == fgui.ScrollBarDisplayType.Default)
                scrollBarDisplay = fgui.UIConfig.defaultScrollBarDisplay;
            if (scrollBarDisplay != fgui.ScrollBarDisplayType.Hidden) {
                if (this._scrollType == fgui.ScrollType.Both || this._scrollType == fgui.ScrollType.Vertical) {
                    var res = vtScrollBarRes ? vtScrollBarRes : fgui.UIConfig.verticalScrollBar;
                    if (res) {
                        this._vtScrollBar = (fgui.UIPackage.createObjectFromURL(res));
                        if (!this._vtScrollBar)
                            throw "cannot create scrollbar from " + res;
                        this._vtScrollBar.setScrollPane(this, true);
                        this._owner.displayObject.addChild(this._vtScrollBar.displayObject);
                    }
                }
                if (this._scrollType == fgui.ScrollType.Both || this._scrollType == fgui.ScrollType.Horizontal) {
                    res = hzScrollBarRes ? hzScrollBarRes : fgui.UIConfig.horizontalScrollBar;
                    if (res) {
                        this._hzScrollBar = (fgui.UIPackage.createObjectFromURL(res));
                        if (!this._hzScrollBar)
                            throw "cannot create scrollbar from " + res;
                        this._hzScrollBar.setScrollPane(this, false);
                        this._owner.displayObject.addChild(this._hzScrollBar.displayObject);
                    }
                }
                this._scrollBarDisplayAuto = scrollBarDisplay == fgui.ScrollBarDisplayType.Auto;
                if (this._scrollBarDisplayAuto) {
                    if (this._vtScrollBar)
                        this._vtScrollBar.displayObject.visible = false;
                    if (this._hzScrollBar)
                        this._hzScrollBar.displayObject.visible = false;
                }
            }
            else
                this._mouseWheelEnabled = false;
            if (headerRes) {
                this._header = fgui.UIPackage.createObjectFromURL(headerRes);
                if (this._header == null)
                    throw new Error("FairyGUI: cannot create scrollPane this.header from " + headerRes);
            }
            if (footerRes) {
                this._footer = fgui.UIPackage.createObjectFromURL(footerRes);
                if (this._footer == null)
                    throw new Error("FairyGUI: cannot create scrollPane this.footer from " + footerRes);
            }
            if (this._header != null || this._footer != null)
                this._refreshBarAxis = (this._scrollType == fgui.ScrollType.Both || this._scrollType == fgui.ScrollType.Vertical) ? "y" : "x";
            this.setSize(this.owner.width, this.owner.height);
        }
        dispose() {
            if (this._tweening != 0)
                Laya.timer.clear(this, this.tweenUpdate);
            this._pageController = null;
            if (this._hzScrollBar != null)
                this._hzScrollBar.dispose();
            if (this._vtScrollBar != null)
                this._vtScrollBar.dispose();
            if (this._header != null)
                this._header.dispose();
            if (this._footer != null)
                this._footer.dispose();
        }
        get owner() {
            return this._owner;
        }
        get hzScrollBar() {
            return this._hzScrollBar;
        }
        get vtScrollBar() {
            return this._vtScrollBar;
        }
        get header() {
            return this._header;
        }
        get footer() {
            return this._footer;
        }
        get bouncebackEffect() {
            return this._bouncebackEffect;
        }
        set bouncebackEffect(sc) {
            this._bouncebackEffect = sc;
        }
        get touchEffect() {
            return this._touchEffect;
        }
        set touchEffect(sc) {
            this._touchEffect = sc;
        }
        set scrollStep(val) {
            this._scrollStep = val;
            if (this._scrollStep == 0)
                this._scrollStep = fgui.UIConfig.defaultScrollStep;
            this._mouseWheelStep = this._scrollStep * 2;
        }
        get scrollStep() {
            return this._scrollStep;
        }
        get snapToItem() {
            return this._snapToItem;
        }
        set snapToItem(value) {
            this._snapToItem = value;
        }
        get mouseWheelEnabled() {
            return this._mouseWheelEnabled;
        }
        set mouseWheelEnabled(value) {
            this._mouseWheelEnabled = value;
        }
        get decelerationRate() {
            return this._decelerationRate;
        }
        set decelerationRate(value) {
            this._decelerationRate = value;
        }
        get isDragged() {
            return this._dragged;
        }
        get percX() {
            return this._overlapSize.x == 0 ? 0 : this._xPos / this._overlapSize.x;
        }
        set percX(value) {
            this.setPercX(value, false);
        }
        setPercX(value, ani) {
            this._owner.ensureBoundsCorrect();
            this.setPosX(this._overlapSize.x * fgui.ToolSet.clamp01(value), ani);
        }
        get percY() {
            return this._overlapSize.y == 0 ? 0 : this._yPos / this._overlapSize.y;
        }
        set percY(value) {
            this.setPercY(value, false);
        }
        setPercY(value, ani) {
            this._owner.ensureBoundsCorrect();
            this.setPosY(this._overlapSize.y * fgui.ToolSet.clamp01(value), ani);
        }
        get posX() {
            return this._xPos;
        }
        set posX(value) {
            this.setPosX(value, false);
        }
        setPosX(value, ani) {
            this._owner.ensureBoundsCorrect();
            if (this._loop == 1)
                value = this.loopCheckingNewPos(value, "x");
            value = fgui.ToolSet.clamp(value, 0, this._overlapSize.x);
            if (value != this._xPos) {
                this._xPos = value;
                this.posChanged(ani);
            }
        }
        get posY() {
            return this._yPos;
        }
        set posY(value) {
            this.setPosY(value, false);
        }
        setPosY(value, ani) {
            this._owner.ensureBoundsCorrect();
            if (this._loop == 1)
                value = this.loopCheckingNewPos(value, "y");
            value = fgui.ToolSet.clamp(value, 0, this._overlapSize.y);
            if (value != this._yPos) {
                this._yPos = value;
                this.posChanged(ani);
            }
        }
        get contentWidth() {
            return this._contentSize.x;
        }
        get contentHeight() {
            return this._contentSize.y;
        }
        get viewWidth() {
            return this._viewSize.x;
        }
        set viewWidth(value) {
            value = value + this._owner.margin.left + this._owner.margin.right;
            if (this._vtScrollBar != null && !this._floating)
                value += this._vtScrollBar.width;
            this._owner.width = value;
        }
        get viewHeight() {
            return this._viewSize.y;
        }
        set viewHeight(value) {
            value = value + this._owner.margin.top + this._owner.margin.bottom;
            if (this._hzScrollBar != null && !this._floating)
                value += this._hzScrollBar.height;
            this._owner.height = value;
        }
        get currentPageX() {
            if (!this._pageMode)
                return 0;
            var page = Math.floor(this._xPos / this._pageSize.x);
            if (this._xPos - page * this._pageSize.x > this._pageSize.x * 0.5)
                page++;
            return page;
        }
        set currentPageX(value) {
            this.setCurrentPageX(value, false);
        }
        get currentPageY() {
            if (!this._pageMode)
                return 0;
            var page = Math.floor(this._yPos / this._pageSize.y);
            if (this._yPos - page * this._pageSize.y > this._pageSize.y * 0.5)
                page++;
            return page;
        }
        set currentPageY(value) {
            this.setCurrentPageY(value, false);
        }
        setCurrentPageX(value, ani) {
            if (!this._pageMode)
                return;
            this._owner.ensureBoundsCorrect();
            if (this._overlapSize.x > 0)
                this.setPosX(value * this._pageSize.x, ani);
        }
        setCurrentPageY(value, ani) {
            if (!this._pageMode)
                return;
            this._owner.ensureBoundsCorrect();
            if (this._overlapSize.y > 0)
                this.setPosY(value * this._pageSize.y, ani);
        }
        get isBottomMost() {
            return this._yPos == this._overlapSize.y || this._overlapSize.y == 0;
        }
        get isRightMost() {
            return this._xPos == this._overlapSize.x || this._overlapSize.x == 0;
        }
        get pageController() {
            return this._pageController;
        }
        set pageController(value) {
            this._pageController = value;
        }
        get scrollingPosX() {
            return fgui.ToolSet.clamp(-this._container.x, 0, this._overlapSize.x);
        }
        get scrollingPosY() {
            return fgui.ToolSet.clamp(-this._container.y, 0, this._overlapSize.y);
        }
        scrollTop(ani) {
            this.setPercY(0, ani);
        }
        scrollBottom(ani) {
            this.setPercY(1, ani);
        }
        scrollUp(ratio = 1, ani) {
            if (this._pageMode)
                this.setPosY(this._yPos - this._pageSize.y * ratio, ani);
            else
                this.setPosY(this._yPos - this._scrollStep * ratio, ani);
            ;
        }
        scrollDown(ratio = 1, ani) {
            if (this._pageMode)
                this.setPosY(this._yPos + this._pageSize.y * ratio, ani);
            else
                this.setPosY(this._yPos + this._scrollStep * ratio, ani);
        }
        scrollLeft(ratio = 1, ani) {
            if (this._pageMode)
                this.setPosX(this._xPos - this._pageSize.x * ratio, ani);
            else
                this.setPosX(this._xPos - this._scrollStep * ratio, ani);
        }
        scrollRight(ratio = 1, ani) {
            if (this._pageMode)
                this.setPosX(this._xPos + this._pageSize.x * ratio, ani);
            else
                this.setPosX(this._xPos + this._scrollStep * ratio, ani);
        }
        scrollToView(target, ani, setFirst) {
            this._owner.ensureBoundsCorrect();
            if (this._needRefresh)
                this.refresh();
            var rect;
            if (target instanceof fgui.GObject) {
                if (target.parent != this._owner) {
                    target.parent.localToGlobalRect(target.x, target.y, target.width, target.height, ScrollPane.sHelperRect);
                    rect = this._owner.globalToLocalRect(ScrollPane.sHelperRect.x, ScrollPane.sHelperRect.y, ScrollPane.sHelperRect.width, ScrollPane.sHelperRect.height, ScrollPane.sHelperRect);
                }
                else {
                    rect = ScrollPane.sHelperRect;
                    rect.setTo(target.x, target.y, target.width, target.height);
                }
            }
            else
                rect = (target);
            if (this._overlapSize.y > 0) {
                var bottom = this._yPos + this._viewSize.y;
                if (setFirst || rect.y <= this._yPos || rect.height >= this._viewSize.y) {
                    if (this._pageMode)
                        this.setPosY(Math.floor(rect.y / this._pageSize.y) * this._pageSize.y, ani);
                    else
                        this.setPosY(rect.y, ani);
                }
                else if (rect.y + rect.height > bottom) {
                    if (this._pageMode)
                        this.setPosY(Math.floor(rect.y / this._pageSize.y) * this._pageSize.y, ani);
                    else if (rect.height <= this._viewSize.y / 2)
                        this.setPosY(rect.y + rect.height * 2 - this._viewSize.y, ani);
                    else
                        this.setPosY(rect.y + rect.height - this._viewSize.y, ani);
                }
            }
            if (this._overlapSize.x > 0) {
                var right = this._xPos + this._viewSize.x;
                if (setFirst || rect.x <= this._xPos || rect.width >= this._viewSize.x) {
                    if (this._pageMode)
                        this.setPosX(Math.floor(rect.x / this._pageSize.x) * this._pageSize.x, ani);
                    else
                        this.setPosX(rect.x, ani);
                }
                else if (rect.x + rect.width > right) {
                    if (this._pageMode)
                        this.setPosX(Math.floor(rect.x / this._pageSize.x) * this._pageSize.x, ani);
                    else if (rect.width <= this._viewSize.x / 2)
                        this.setPosX(rect.x + rect.width * 2 - this._viewSize.x, ani);
                    else
                        this.setPosX(rect.x + rect.width - this._viewSize.x, ani);
                }
            }
            if (!ani && this._needRefresh)
                this.refresh();
        }
        isChildInView(obj) {
            if (this._overlapSize.y > 0) {
                var dist = obj.y + this._container.y;
                if (dist < -obj.height || dist > this._viewSize.y)
                    return false;
            }
            if (this._overlapSize.x > 0) {
                dist = obj.x + this._container.x;
                if (dist < -obj.width || dist > this._viewSize.x)
                    return false;
            }
            return true;
        }
        cancelDragging() {
            this._owner.displayObject.stage.off(Laya.Event.MOUSE_MOVE, this, this.__mouseMove);
            this._owner.displayObject.stage.off(Laya.Event.MOUSE_UP, this, this.__mouseUp);
            this._owner.displayObject.stage.off(Laya.Event.CLICK, this, this.__click);
            if (ScrollPane.draggingPane == this)
                ScrollPane.draggingPane = null;
            ScrollPane._gestureFlag = 0;
            this._dragged = false;
            this._maskContainer.mouseEnabled = true;
        }
        lockHeader(size) {
            if (this._headerLockedSize == size)
                return;
            this._headerLockedSize = size;
            if (!this._refreshEventDispatching && this._container[this._refreshBarAxis] >= 0) {
                this._tweenStart.setTo(this._container.x, this._container.y);
                this._tweenChange.setTo(0, 0);
                this._tweenChange[this._refreshBarAxis] = this._headerLockedSize - this._tweenStart[this._refreshBarAxis];
                this._tweenDuration.setTo(ScrollPane.TWEEN_TIME_DEFAULT, ScrollPane.TWEEN_TIME_DEFAULT);
                this.startTween(2);
            }
        }
        lockFooter(size) {
            if (this._footerLockedSize == size)
                return;
            this._footerLockedSize = size;
            if (!this._refreshEventDispatching && this._container[this._refreshBarAxis] <= -this._overlapSize[this._refreshBarAxis]) {
                this._tweenStart.setTo(this._container.x, this._container.y);
                this._tweenChange.setTo(0, 0);
                var max = this._overlapSize[this._refreshBarAxis];
                if (max == 0)
                    max = Math.max(this._contentSize[this._refreshBarAxis] + this._footerLockedSize - this._viewSize[this._refreshBarAxis], 0);
                else
                    max += this._footerLockedSize;
                this._tweenChange[this._refreshBarAxis] = -max - this._tweenStart[this._refreshBarAxis];
                this._tweenDuration.setTo(ScrollPane.TWEEN_TIME_DEFAULT, ScrollPane.TWEEN_TIME_DEFAULT);
                this.startTween(2);
            }
        }
        onOwnerSizeChanged() {
            this.setSize(this._owner.width, this._owner.height);
            this.posChanged(false);
        }
        handleControllerChanged(c) {
            if (this._pageController == c) {
                if (this._scrollType == fgui.ScrollType.Horizontal)
                    this.setCurrentPageX(c.selectedIndex, true);
                else
                    this.setCurrentPageY(c.selectedIndex, true);
            }
        }
        updatePageController() {
            if (this._pageController != null && !this._pageController.changing) {
                var index;
                if (this._scrollType == fgui.ScrollType.Horizontal)
                    index = this.currentPageX;
                else
                    index = this.currentPageY;
                if (index < this._pageController.pageCount) {
                    var c = this._pageController;
                    this._pageController = null;
                    c.selectedIndex = index;
                    this._pageController = c;
                }
            }
        }
        adjustMaskContainer() {
            var mx, my;
            if (this._displayOnLeft && this._vtScrollBar != null && !this._floating)
                mx = Math.floor(this._owner.margin.left + this._vtScrollBar.width);
            else
                mx = Math.floor(this._owner.margin.left);
            my = Math.floor(this._owner.margin.top);
            this._maskContainer.pos(mx, my);
            if (this._owner._alignOffset.x != 0 || this._owner._alignOffset.y != 0) {
                if (this._alignContainer == null) {
                    this._alignContainer = new Laya.Sprite();
                    this._maskContainer.addChild(this._alignContainer);
                    this._alignContainer.addChild(this._container);
                }
                this._alignContainer.pos(this._owner._alignOffset.x, this._owner._alignOffset.y);
            }
            else if (this._alignContainer) {
                this._alignContainer.pos(0, 0);
            }
        }
        setSize(aWidth, aHeight) {
            this.adjustMaskContainer();
            if (this._hzScrollBar) {
                this._hzScrollBar.y = aHeight - this._hzScrollBar.height;
                if (this._vtScrollBar) {
                    this._hzScrollBar.width = aWidth - this._vtScrollBar.width - this._scrollBarMargin.left - this._scrollBarMargin.right;
                    if (this._displayOnLeft)
                        this._hzScrollBar.x = this._scrollBarMargin.left + this._vtScrollBar.width;
                    else
                        this._hzScrollBar.x = this._scrollBarMargin.left;
                }
                else {
                    this._hzScrollBar.width = aWidth - this._scrollBarMargin.left - this._scrollBarMargin.right;
                    this._hzScrollBar.x = this._scrollBarMargin.left;
                }
            }
            if (this._vtScrollBar) {
                if (!this._displayOnLeft)
                    this._vtScrollBar.x = aWidth - this._vtScrollBar.width;
                if (this._hzScrollBar)
                    this._vtScrollBar.height = aHeight - this._hzScrollBar.height - this._scrollBarMargin.top - this._scrollBarMargin.bottom;
                else
                    this._vtScrollBar.height = aHeight - this._scrollBarMargin.top - this._scrollBarMargin.bottom;
                this._vtScrollBar.y = this._scrollBarMargin.top;
            }
            this._viewSize.x = aWidth;
            this._viewSize.y = aHeight;
            if (this._hzScrollBar && !this._floating)
                this._viewSize.y -= this._hzScrollBar.height;
            if (this._vtScrollBar && !this._floating)
                this._viewSize.x -= this._vtScrollBar.width;
            this._viewSize.x -= (this._owner.margin.left + this._owner.margin.right);
            this._viewSize.y -= (this._owner.margin.top + this._owner.margin.bottom);
            this._viewSize.x = Math.max(1, this._viewSize.x);
            this._viewSize.y = Math.max(1, this._viewSize.y);
            this._pageSize.x = this._viewSize.x;
            this._pageSize.y = this._viewSize.y;
            this.handleSizeChanged();
        }
        setContentSize(aWidth, aHeight) {
            if (this._contentSize.x == aWidth && this._contentSize.y == aHeight)
                return;
            this._contentSize.x = aWidth;
            this._contentSize.y = aHeight;
            this.handleSizeChanged();
        }
        changeContentSizeOnScrolling(deltaWidth, deltaHeight, deltaPosX, deltaPosY) {
            var isRightmost = this._xPos == this._overlapSize.x;
            var isBottom = this._yPos == this._overlapSize.y;
            this._contentSize.x += deltaWidth;
            this._contentSize.y += deltaHeight;
            this.handleSizeChanged();
            if (this._tweening == 1) {
                if (deltaWidth != 0 && isRightmost && this._tweenChange.x < 0) {
                    this._xPos = this._overlapSize.x;
                    this._tweenChange.x = -this._xPos - this._tweenStart.x;
                }
                if (deltaHeight != 0 && isBottom && this._tweenChange.y < 0) {
                    this._yPos = this._overlapSize.y;
                    this._tweenChange.y = -this._yPos - this._tweenStart.y;
                }
            }
            else if (this._tweening == 2) {
                if (deltaPosX != 0) {
                    this._container.x -= deltaPosX;
                    this._tweenStart.x -= deltaPosX;
                    this._xPos = -this._container.x;
                }
                if (deltaPosY != 0) {
                    this._container.y -= deltaPosY;
                    this._tweenStart.y -= deltaPosY;
                    this._yPos = -this._container.y;
                }
            }
            else if (this._dragged) {
                if (deltaPosX != 0) {
                    this._container.x -= deltaPosX;
                    this._containerPos.x -= deltaPosX;
                    this._xPos = -this._container.x;
                }
                if (deltaPosY != 0) {
                    this._container.y -= deltaPosY;
                    this._containerPos.y -= deltaPosY;
                    this._yPos = -this._container.y;
                }
            }
            else {
                if (deltaWidth != 0 && isRightmost) {
                    this._xPos = this._overlapSize.x;
                    this._container.x = -this._xPos;
                }
                if (deltaHeight != 0 && isBottom) {
                    this._yPos = this._overlapSize.y;
                    this._container.y = -this._yPos;
                }
            }
            if (this._pageMode)
                this.updatePageController();
        }
        handleSizeChanged() {
            if (this._displayInDemand) {
                this._vScrollNone = this._contentSize.y <= this._viewSize.y;
                this._hScrollNone = this._contentSize.x <= this._viewSize.x;
            }
            if (this._vtScrollBar) {
                if (this._contentSize.y == 0)
                    this._vtScrollBar.setDisplayPerc(0);
                else
                    this._vtScrollBar.setDisplayPerc(Math.min(1, this._viewSize.y / this._contentSize.y));
            }
            if (this._hzScrollBar) {
                if (this._contentSize.x == 0)
                    this._hzScrollBar.setDisplayPerc(0);
                else
                    this._hzScrollBar.setDisplayPerc(Math.min(1, this._viewSize.x / this._contentSize.x));
            }
            this.updateScrollBarVisible();
            var rect = this._maskContainer.scrollRect;
            if (rect) {
                rect.width = this._viewSize.x;
                rect.height = this._viewSize.y;
                if (this._vScrollNone && this._vtScrollBar)
                    rect.width += this._vtScrollBar.width;
                if (this._hScrollNone && this._hzScrollBar)
                    rect.height += this._hzScrollBar.height;
                this._maskContainer.scrollRect = rect;
            }
            if (this._scrollType == fgui.ScrollType.Horizontal || this._scrollType == fgui.ScrollType.Both)
                this._overlapSize.x = Math.ceil(Math.max(0, this._contentSize.x - this._viewSize.x));
            else
                this._overlapSize.x = 0;
            if (this._scrollType == fgui.ScrollType.Vertical || this._scrollType == fgui.ScrollType.Both)
                this._overlapSize.y = Math.ceil(Math.max(0, this._contentSize.y - this._viewSize.y));
            else
                this._overlapSize.y = 0;
            this._xPos = fgui.ToolSet.clamp(this._xPos, 0, this._overlapSize.x);
            this._yPos = fgui.ToolSet.clamp(this._yPos, 0, this._overlapSize.y);
            if (this._refreshBarAxis != null) {
                var max = this._overlapSize[this._refreshBarAxis];
                if (max == 0)
                    max = Math.max(this._contentSize[this._refreshBarAxis] + this._footerLockedSize - this._viewSize[this._refreshBarAxis], 0);
                else
                    max += this._footerLockedSize;
                if (this._refreshBarAxis == "x") {
                    this._container.pos(fgui.ToolSet.clamp(this._container.x, -max, this._headerLockedSize), fgui.ToolSet.clamp(this._container.y, -this._overlapSize.y, 0));
                }
                else {
                    this._container.pos(fgui.ToolSet.clamp(this._container.x, -this._overlapSize.x, 0), fgui.ToolSet.clamp(this._container.y, -max, this._headerLockedSize));
                }
                if (this._header != null) {
                    if (this._refreshBarAxis == "x")
                        this._header.height = this._viewSize.y;
                    else
                        this._header.width = this._viewSize.x;
                }
                if (this._footer != null) {
                    if (this._refreshBarAxis == "y")
                        this._footer.height = this._viewSize.y;
                    else
                        this._footer.width = this._viewSize.x;
                }
            }
            else {
                this._container.pos(fgui.ToolSet.clamp(this._container.x, -this._overlapSize.x, 0), fgui.ToolSet.clamp(this._container.y, -this._overlapSize.y, 0));
            }
            this.updateScrollBarPos();
            if (this._pageMode)
                this.updatePageController();
        }
        posChanged(ani) {
            if (this._aniFlag == 0)
                this._aniFlag = ani ? 1 : -1;
            else if (this._aniFlag == 1 && !ani)
                this._aniFlag = -1;
            this._needRefresh = true;
            Laya.timer.callLater(this, this.refresh);
        }
        refresh() {
            if (this._owner.displayObject == null) {
                return;
            }
            this._needRefresh = false;
            Laya.timer.clear(this, this.refresh);
            if (this._pageMode || this._snapToItem) {
                ScrollPane.sEndPos.setTo(-this._xPos, -this._yPos);
                this.alignPosition(ScrollPane.sEndPos, false);
                this._xPos = -ScrollPane.sEndPos.x;
                this._yPos = -ScrollPane.sEndPos.y;
            }
            this.refresh2();
            fgui.Events.dispatch(fgui.Events.SCROLL, this._owner.displayObject);
            if (this._needRefresh) {
                this._needRefresh = false;
                Laya.timer.clear(this, this.refresh);
                this.refresh2();
            }
            this.updateScrollBarPos();
            this._aniFlag = 0;
        }
        refresh2() {
            if (this._aniFlag == 1 && !this._dragged) {
                var posX;
                var posY;
                if (this._overlapSize.x > 0)
                    posX = -Math.floor(this._xPos);
                else {
                    if (this._container.x != 0)
                        this._container.x = 0;
                    posX = 0;
                }
                if (this._overlapSize.y > 0)
                    posY = -Math.floor(this._yPos);
                else {
                    if (this._container.y != 0)
                        this._container.y = 0;
                    posY = 0;
                }
                if (posX != this._container.x || posY != this._container.y) {
                    this._tweenDuration.setTo(ScrollPane.TWEEN_TIME_GO, ScrollPane.TWEEN_TIME_GO);
                    this._tweenStart.setTo(this._container.x, this._container.y);
                    this._tweenChange.setTo(posX - this._tweenStart.x, posY - this._tweenStart.y);
                    this.startTween(1);
                }
                else if (this._tweening != 0)
                    this.killTween();
            }
            else {
                if (this._tweening != 0)
                    this.killTween();
                this._container.pos(Math.floor(-this._xPos), Math.floor(-this._yPos));
                this.loopCheckingCurrent();
            }
            if (this._pageMode)
                this.updatePageController();
        }
        __mouseDown() {
            if (!this._touchEffect)
                return;
            if (this._tweening != 0) {
                this.killTween();
                this._dragged = true;
            }
            else
                this._dragged = false;
            var pt = this._owner.globalToLocal(Laya.stage.mouseX, Laya.stage.mouseY, ScrollPane.sHelperPoint);
            this._containerPos.setTo(this._container.x, this._container.y);
            this._beginTouchPos.setTo(pt.x, pt.y);
            this._lastTouchPos.setTo(pt.x, pt.y);
            this._lastTouchGlobalPos.setTo(Laya.stage.mouseX, Laya.stage.mouseY);
            this._isHoldAreaDone = false;
            this._velocity.setTo(0, 0);
            this._velocityScale = 1;
            this._lastMoveTime = Laya.timer.currTimer / 1000;
            this._owner.displayObject.stage.on(Laya.Event.MOUSE_MOVE, this, this.__mouseMove);
            this._owner.displayObject.stage.on(Laya.Event.MOUSE_UP, this, this.__mouseUp);
            this._owner.displayObject.stage.on(Laya.Event.CLICK, this, this.__click);
        }
        __mouseMove() {
            if (!this._touchEffect || this.owner.isDisposed)
                return;
            if (ScrollPane.draggingPane != null && ScrollPane.draggingPane != this || fgui.GObject.draggingObject != null)
                return;
            var sensitivity = fgui.UIConfig.touchScrollSensitivity;
            var pt = this._owner.globalToLocal(Laya.stage.mouseX, Laya.stage.mouseY, ScrollPane.sHelperPoint);
            var diff, diff2;
            var sv, sh, st;
            if (this._scrollType == fgui.ScrollType.Vertical) {
                if (!this._isHoldAreaDone) {
                    ScrollPane._gestureFlag |= 1;
                    diff = Math.abs(this._beginTouchPos.y - pt.y);
                    if (diff < sensitivity)
                        return;
                    if ((ScrollPane._gestureFlag & 2) != 0) {
                        diff2 = Math.abs(this._beginTouchPos.x - pt.x);
                        if (diff < diff2)
                            return;
                    }
                }
                sv = true;
            }
            else if (this._scrollType == fgui.ScrollType.Horizontal) {
                if (!this._isHoldAreaDone) {
                    ScrollPane._gestureFlag |= 2;
                    diff = Math.abs(this._beginTouchPos.x - pt.x);
                    if (diff < sensitivity)
                        return;
                    if ((ScrollPane._gestureFlag & 1) != 0) {
                        diff2 = Math.abs(this._beginTouchPos.y - pt.y);
                        if (diff < diff2)
                            return;
                    }
                }
                sh = true;
            }
            else {
                ScrollPane._gestureFlag = 3;
                if (!this._isHoldAreaDone) {
                    diff = Math.abs(this._beginTouchPos.y - pt.y);
                    if (diff < sensitivity) {
                        diff = Math.abs(this._beginTouchPos.x - pt.x);
                        if (diff < sensitivity)
                            return;
                    }
                }
                sv = sh = true;
            }
            var newPosX = Math.floor(this._containerPos.x + pt.x - this._beginTouchPos.x);
            var newPosY = Math.floor(this._containerPos.y + pt.y - this._beginTouchPos.y);
            if (sv) {
                if (newPosY > 0) {
                    if (!this._bouncebackEffect)
                        this._container.y = 0;
                    else if (this._header != null && this._header.maxHeight != 0)
                        this._container.y = Math.floor(Math.min(newPosY * 0.5, this._header.maxHeight));
                    else
                        this._container.y = Math.floor(Math.min(newPosY * 0.5, this._viewSize.y * ScrollPane.PULL_RATIO));
                }
                else if (newPosY < -this._overlapSize.y) {
                    if (!this._bouncebackEffect)
                        this._container.y = -this._overlapSize.y;
                    else if (this._footer != null && this._footer.maxHeight > 0)
                        this._container.y = Math.floor(Math.max((newPosY + this._overlapSize.y) * 0.5, -this._footer.maxHeight) - this._overlapSize.y);
                    else
                        this._container.y = Math.floor(Math.max((newPosY + this._overlapSize.y) * 0.5, -this._viewSize.y * ScrollPane.PULL_RATIO) - this._overlapSize.y);
                }
                else
                    this._container.y = newPosY;
            }
            if (sh) {
                if (newPosX > 0) {
                    if (!this._bouncebackEffect)
                        this._container.x = 0;
                    else if (this._header != null && this._header.maxWidth != 0)
                        this._container.x = Math.floor(Math.min(newPosX * 0.5, this._header.maxWidth));
                    else
                        this._container.x = Math.floor(Math.min(newPosX * 0.5, this._viewSize.x * ScrollPane.PULL_RATIO));
                }
                else if (newPosX < 0 - this._overlapSize.x) {
                    if (!this._bouncebackEffect)
                        this._container.x = -this._overlapSize.x;
                    else if (this._footer != null && this._footer.maxWidth > 0)
                        this._container.x = Math.floor(Math.max((newPosX + this._overlapSize.x) * 0.5, -this._footer.maxWidth) - this._overlapSize.x);
                    else
                        this._container.x = Math.floor(Math.max((newPosX + this._overlapSize.x) * 0.5, -this._viewSize.x * ScrollPane.PULL_RATIO) - this._overlapSize.x);
                }
                else
                    this._container.x = newPosX;
            }
            var frameRate = Laya.stage.frameRate == Laya.Stage.FRAME_SLOW ? 30 : 60;
            var now = Laya.timer.currTimer / 1000;
            var deltaTime = Math.max(now - this._lastMoveTime, 1 / frameRate);
            var deltaPositionX = pt.x - this._lastTouchPos.x;
            var deltaPositionY = pt.y - this._lastTouchPos.y;
            if (!sh)
                deltaPositionX = 0;
            if (!sv)
                deltaPositionY = 0;
            if (deltaTime != 0) {
                var elapsed = deltaTime * frameRate - 1;
                if (elapsed > 1) {
                    var factor = Math.pow(0.833, elapsed);
                    this._velocity.x = this._velocity.x * factor;
                    this._velocity.y = this._velocity.y * factor;
                }
                this._velocity.x = fgui.ToolSet.lerp(this._velocity.x, deltaPositionX * 60 / frameRate / deltaTime, deltaTime * 10);
                this._velocity.y = fgui.ToolSet.lerp(this._velocity.y, deltaPositionY * 60 / frameRate / deltaTime, deltaTime * 10);
            }
            var deltaGlobalPositionX = this._lastTouchGlobalPos.x - Laya.stage.mouseX;
            var deltaGlobalPositionY = this._lastTouchGlobalPos.y - Laya.stage.mouseY;
            if (deltaPositionX != 0)
                this._velocityScale = Math.abs(deltaGlobalPositionX / deltaPositionX);
            else if (deltaPositionY != 0)
                this._velocityScale = Math.abs(deltaGlobalPositionY / deltaPositionY);
            this._lastTouchPos.setTo(pt.x, pt.y);
            this._lastTouchGlobalPos.setTo(Laya.stage.mouseX, Laya.stage.mouseY);
            this._lastMoveTime = now;
            if (this._overlapSize.x > 0)
                this._xPos = fgui.ToolSet.clamp(-this._container.x, 0, this._overlapSize.x);
            if (this._overlapSize.y > 0)
                this._yPos = fgui.ToolSet.clamp(-this._container.y, 0, this._overlapSize.y);
            if (this._loop != 0) {
                newPosX = this._container.x;
                newPosY = this._container.y;
                if (this.loopCheckingCurrent()) {
                    this._containerPos.x += this._container.x - newPosX;
                    this._containerPos.y += this._container.y - newPosY;
                }
            }
            ScrollPane.draggingPane = this;
            this._isHoldAreaDone = true;
            this._dragged = true;
            this._maskContainer.mouseEnabled = false;
            this.updateScrollBarPos();
            this.updateScrollBarVisible();
            if (this._pageMode)
                this.updatePageController();
            fgui.Events.dispatch(fgui.Events.SCROLL, this._owner.displayObject);
        }
        __mouseUp() {
            this._owner.displayObject.stage.off(Laya.Event.MOUSE_MOVE, this, this.__mouseMove);
            this._owner.displayObject.stage.off(Laya.Event.MOUSE_UP, this, this.__mouseUp);
            this._owner.displayObject.stage.off(Laya.Event.CLICK, this, this.__click);
            if (ScrollPane.draggingPane == this)
                ScrollPane.draggingPane = null;
            ScrollPane._gestureFlag = 0;
            if (!this._dragged || !this._touchEffect) {
                this._dragged = false;
                this._maskContainer.mouseEnabled = true;
                return;
            }
            this._dragged = false;
            this._maskContainer.mouseEnabled = true;
            this._tweenStart.setTo(this._container.x, this._container.y);
            ScrollPane.sEndPos.setTo(this._tweenStart.x, this._tweenStart.y);
            var flag = false;
            if (this._container.x > 0) {
                ScrollPane.sEndPos.x = 0;
                flag = true;
            }
            else if (this._container.x < -this._overlapSize.x) {
                ScrollPane.sEndPos.x = -this._overlapSize.x;
                flag = true;
            }
            if (this._container.y > 0) {
                ScrollPane.sEndPos.y = 0;
                flag = true;
            }
            else if (this._container.y < -this._overlapSize.y) {
                ScrollPane.sEndPos.y = -this._overlapSize.y;
                flag = true;
            }
            if (flag) {
                this._tweenChange.setTo(ScrollPane.sEndPos.x - this._tweenStart.x, ScrollPane.sEndPos.y - this._tweenStart.y);
                if (this._tweenChange.x < -fgui.UIConfig.touchDragSensitivity || this._tweenChange.y < -fgui.UIConfig.touchDragSensitivity) {
                    this._refreshEventDispatching = true;
                    fgui.Events.dispatch(fgui.Events.PULL_DOWN_RELEASE, this._owner.displayObject);
                    this._refreshEventDispatching = false;
                }
                else if (this._tweenChange.x > fgui.UIConfig.touchDragSensitivity || this._tweenChange.y > fgui.UIConfig.touchDragSensitivity) {
                    this._refreshEventDispatching = true;
                    fgui.Events.dispatch(fgui.Events.PULL_UP_RELEASE, this._owner.displayObject);
                    this._refreshEventDispatching = false;
                }
                if (this._headerLockedSize > 0 && ScrollPane.sEndPos[this._refreshBarAxis] == 0) {
                    ScrollPane.sEndPos[this._refreshBarAxis] = this._headerLockedSize;
                    this._tweenChange.x = ScrollPane.sEndPos.x - this._tweenStart.x;
                    this._tweenChange.y = ScrollPane.sEndPos.y - this._tweenStart.y;
                }
                else if (this._footerLockedSize > 0 && ScrollPane.sEndPos[this._refreshBarAxis] == -this._overlapSize[this._refreshBarAxis]) {
                    var max = this._overlapSize[this._refreshBarAxis];
                    if (max == 0)
                        max = Math.max(this._contentSize[this._refreshBarAxis] + this._footerLockedSize - this._viewSize[this._refreshBarAxis], 0);
                    else
                        max += this._footerLockedSize;
                    ScrollPane.sEndPos[this._refreshBarAxis] = -max;
                    this._tweenChange.x = ScrollPane.sEndPos.x - this._tweenStart.x;
                    this._tweenChange.y = ScrollPane.sEndPos.y - this._tweenStart.y;
                }
                this._tweenDuration.setTo(ScrollPane.TWEEN_TIME_DEFAULT, ScrollPane.TWEEN_TIME_DEFAULT);
            }
            else {
                if (!this._inertiaDisabled) {
                    var frameRate = Laya.stage.frameRate == Laya.Stage.FRAME_SLOW ? 30 : 60;
                    var elapsed = (Laya.timer.currTimer / 1000 - this._lastMoveTime) * frameRate - 1;
                    if (elapsed > 1) {
                        var factor = Math.pow(0.833, elapsed);
                        this._velocity.x = this._velocity.x * factor;
                        this._velocity.y = this._velocity.y * factor;
                    }
                    this.updateTargetAndDuration(this._tweenStart, ScrollPane.sEndPos);
                }
                else
                    this._tweenDuration.setTo(ScrollPane.TWEEN_TIME_DEFAULT, ScrollPane.TWEEN_TIME_DEFAULT);
                ScrollPane.sOldChange.setTo(ScrollPane.sEndPos.x - this._tweenStart.x, ScrollPane.sEndPos.y - this._tweenStart.y);
                this.loopCheckingTarget(ScrollPane.sEndPos);
                if (this._pageMode || this._snapToItem)
                    this.alignPosition(ScrollPane.sEndPos, true);
                this._tweenChange.x = ScrollPane.sEndPos.x - this._tweenStart.x;
                this._tweenChange.y = ScrollPane.sEndPos.y - this._tweenStart.y;
                if (this._tweenChange.x == 0 && this._tweenChange.y == 0) {
                    this.updateScrollBarVisible();
                    return;
                }
                if (this._pageMode || this._snapToItem) {
                    this.fixDuration("x", ScrollPane.sOldChange.x);
                    this.fixDuration("y", ScrollPane.sOldChange.y);
                }
            }
            this.startTween(2);
        }
        __click() {
            this._dragged = false;
        }
        __mouseWheel(evt) {
            if (!this._mouseWheelEnabled)
                return;
            var delta = evt["delta"];
            delta = delta > 0 ? -1 : (delta < 0 ? 1 : 0);
            if (this._overlapSize.x > 0 && this._overlapSize.y == 0) {
                if (this._pageMode)
                    this.setPosX(this._xPos + this._pageSize.x * delta, false);
                else
                    this.setPosX(this._xPos + this._mouseWheelStep * delta, false);
            }
            else {
                if (this._pageMode)
                    this.setPosY(this._yPos + this._pageSize.y * delta, false);
                else
                    this.setPosY(this._yPos + this._mouseWheelStep * delta, false);
            }
        }
        updateScrollBarPos() {
            if (this._vtScrollBar != null)
                this._vtScrollBar.setScrollPerc(this._overlapSize.y == 0 ? 0 : fgui.ToolSet.clamp(-this._container.y, 0, this._overlapSize.y) / this._overlapSize.y);
            if (this._hzScrollBar != null)
                this._hzScrollBar.setScrollPerc(this._overlapSize.x == 0 ? 0 : fgui.ToolSet.clamp(-this._container.x, 0, this._overlapSize.x) / this._overlapSize.x);
            this.checkRefreshBar();
        }
        updateScrollBarVisible() {
            if (this._vtScrollBar) {
                if (this._viewSize.y <= this._vtScrollBar.minSize || this._vScrollNone)
                    this._vtScrollBar.displayObject.visible = false;
                else
                    this.updateScrollBarVisible2(this._vtScrollBar);
            }
            if (this._hzScrollBar) {
                if (this._viewSize.x <= this._hzScrollBar.minSize || this._hScrollNone)
                    this._hzScrollBar.displayObject.visible = false;
                else
                    this.updateScrollBarVisible2(this._hzScrollBar);
            }
        }
        updateScrollBarVisible2(bar) {
            if (this._scrollBarDisplayAuto)
                fgui.GTween.kill(bar, false, "alpha");
            if (this._scrollBarDisplayAuto && this._tweening == 0 && !this._dragged && !bar.gripDragging) {
                if (bar.displayObject.visible)
                    fgui.GTween.to(1, 0, 0.5).setDelay(0.5).onComplete(this.__barTweenComplete, this).setTarget(bar, "alpha");
            }
            else {
                bar.alpha = 1;
                bar.displayObject.visible = true;
            }
        }
        __barTweenComplete(tweener) {
            var bar = (tweener.target);
            bar.alpha = 1;
            bar.displayObject.visible = false;
        }
        getLoopPartSize(division, axis) {
            return (this._contentSize[axis] + (axis == "x" ? (this._owner).columnGap : (this._owner).lineGap)) / division;
        }
        loopCheckingCurrent() {
            var changed = false;
            if (this._loop == 1 && this._overlapSize.x > 0) {
                if (this._xPos < 0.001) {
                    this._xPos += this.getLoopPartSize(2, "x");
                    changed = true;
                }
                else if (this._xPos >= this._overlapSize.x) {
                    this._xPos -= this.getLoopPartSize(2, "x");
                    changed = true;
                }
            }
            else if (this._loop == 2 && this._overlapSize.y > 0) {
                if (this._yPos < 0.001) {
                    this._yPos += this.getLoopPartSize(2, "y");
                    changed = true;
                }
                else if (this._yPos >= this._overlapSize.y) {
                    this._yPos -= this.getLoopPartSize(2, "y");
                    changed = true;
                }
            }
            if (changed)
                this._container.pos(Math.floor(-this._xPos), Math.floor(-this._yPos));
            return changed;
        }
        loopCheckingTarget(endPos) {
            if (this._loop == 1)
                this.loopCheckingTarget2(endPos, "x");
            if (this._loop == 2)
                this.loopCheckingTarget2(endPos, "y");
        }
        loopCheckingTarget2(endPos, axis) {
            var halfSize;
            var tmp;
            if (endPos[axis] > 0) {
                halfSize = this.getLoopPartSize(2, axis);
                tmp = this._tweenStart[axis] - halfSize;
                if (tmp <= 0 && tmp >= -this._overlapSize[axis]) {
                    endPos[axis] -= halfSize;
                    this._tweenStart[axis] = tmp;
                }
            }
            else if (endPos[axis] < -this._overlapSize[axis]) {
                halfSize = this.getLoopPartSize(2, axis);
                tmp = this._tweenStart[axis] + halfSize;
                if (tmp <= 0 && tmp >= -this._overlapSize[axis]) {
                    endPos[axis] += halfSize;
                    this._tweenStart[axis] = tmp;
                }
            }
        }
        loopCheckingNewPos(value, axis) {
            if (this._overlapSize[axis] == 0)
                return value;
            var pos = axis == "x" ? this._xPos : this._yPos;
            var changed = false;
            var v;
            if (value < 0.001) {
                value += this.getLoopPartSize(2, axis);
                if (value > pos) {
                    v = this.getLoopPartSize(6, axis);
                    v = Math.ceil((value - pos) / v) * v;
                    pos = fgui.ToolSet.clamp(pos + v, 0, this._overlapSize[axis]);
                    changed = true;
                }
            }
            else if (value >= this._overlapSize[axis]) {
                value -= this.getLoopPartSize(2, axis);
                if (value < pos) {
                    v = this.getLoopPartSize(6, axis);
                    v = Math.ceil((pos - value) / v) * v;
                    pos = fgui.ToolSet.clamp(pos - v, 0, this._overlapSize[axis]);
                    changed = true;
                }
            }
            if (changed) {
                if (axis == "x")
                    this._container.x = -Math.floor(pos);
                else
                    this._container.y = -Math.floor(pos);
            }
            return value;
        }
        alignPosition(pos, inertialScrolling) {
            if (this._pageMode) {
                pos.x = this.alignByPage(pos.x, "x", inertialScrolling);
                pos.y = this.alignByPage(pos.y, "y", inertialScrolling);
            }
            else if (this._snapToItem) {
                var xDir = 0;
                var yDir = 0;
                if (inertialScrolling) {
                    xDir = pos.x - this._containerPos.x;
                    yDir = pos.y - this._containerPos.y;
                }
                var pt = this._owner.getSnappingPositionWithDir(-pos.x, -pos.y, xDir, yDir, ScrollPane.sHelperPoint);
                if (pos.x < 0 && pos.x > -this._overlapSize.x)
                    pos.x = -pt.x;
                if (pos.y < 0 && pos.y > -this._overlapSize.y)
                    pos.y = -pt.y;
            }
        }
        alignByPage(pos, axis, inertialScrolling) {
            var page;
            if (pos > 0)
                page = 0;
            else if (pos < -this._overlapSize[axis])
                page = Math.ceil(this._contentSize[axis] / this._pageSize[axis]) - 1;
            else {
                page = Math.floor(-pos / this._pageSize[axis]);
                var change = inertialScrolling ? (pos - this._containerPos[axis]) : (pos - this._container[axis]);
                var testPageSize = Math.min(this._pageSize[axis], this._contentSize[axis] - (page + 1) * this._pageSize[axis]);
                var delta = -pos - page * this._pageSize[axis];
                if (Math.abs(change) > this._pageSize[axis]) {
                    if (delta > testPageSize * 0.5)
                        page++;
                }
                else {
                    if (delta > testPageSize * (change < 0 ? fgui.UIConfig.defaultScrollPagingThreshold : (1 - fgui.UIConfig.defaultScrollPagingThreshold)))
                        page++;
                }
                pos = -page * this._pageSize[axis];
                if (pos < -this._overlapSize[axis])
                    pos = -this._overlapSize[axis];
            }
            if (inertialScrolling) {
                var oldPos = this._tweenStart[axis];
                var oldPage;
                if (oldPos > 0)
                    oldPage = 0;
                else if (oldPos < -this._overlapSize[axis])
                    oldPage = Math.ceil(this._contentSize[axis] / this._pageSize[axis]) - 1;
                else
                    oldPage = Math.floor(-oldPos / this._pageSize[axis]);
                var startPage = Math.floor(-this._containerPos[axis] / this._pageSize[axis]);
                if (Math.abs(page - startPage) > 1 && Math.abs(oldPage - startPage) <= 1) {
                    if (page > startPage)
                        page = startPage + 1;
                    else
                        page = startPage - 1;
                    pos = -page * this._pageSize[axis];
                }
            }
            return pos;
        }
        updateTargetAndDuration(orignPos, resultPos) {
            resultPos.x = this.updateTargetAndDuration2(orignPos.x, "x");
            resultPos.y = this.updateTargetAndDuration2(orignPos.y, "y");
        }
        updateTargetAndDuration2(pos, axis) {
            var v = this._velocity[axis];
            var duration = 0;
            if (pos > 0)
                pos = 0;
            else if (pos < -this._overlapSize[axis])
                pos = -this._overlapSize[axis];
            else {
                var v2 = Math.abs(v) * this._velocityScale;
                if (Laya.Browser.onMobile)
                    v2 *= 1136 / Math.max(Laya.stage.width, Laya.stage.height);
                var ratio = 0;
                if (this._pageMode || !Laya.Browser.onMobile) {
                    if (v2 > 500)
                        ratio = Math.pow((v2 - 500) / 500, 2);
                }
                else {
                    if (v2 > 1000)
                        ratio = Math.pow((v2 - 1000) / 1000, 2);
                }
                if (ratio != 0) {
                    if (ratio > 1)
                        ratio = 1;
                    v2 *= ratio;
                    v *= ratio;
                    this._velocity[axis] = v;
                    duration = Math.log(60 / v2) / Math.log(this._decelerationRate) / 60;
                    var change = Math.floor(v * duration * 0.4);
                    pos += change;
                }
            }
            if (duration < ScrollPane.TWEEN_TIME_DEFAULT)
                duration = ScrollPane.TWEEN_TIME_DEFAULT;
            this._tweenDuration[axis] = duration;
            return pos;
        }
        fixDuration(axis, oldChange) {
            if (this._tweenChange[axis] == 0 || Math.abs(this._tweenChange[axis]) >= Math.abs(oldChange))
                return;
            var newDuration = Math.abs(this._tweenChange[axis] / oldChange) * this._tweenDuration[axis];
            if (newDuration < ScrollPane.TWEEN_TIME_DEFAULT)
                newDuration = ScrollPane.TWEEN_TIME_DEFAULT;
            this._tweenDuration[axis] = newDuration;
        }
        startTween(type) {
            this._tweenTime.setTo(0, 0);
            this._tweening = type;
            Laya.timer.frameLoop(1, this, this.tweenUpdate);
            this.updateScrollBarVisible();
        }
        killTween() {
            if (this._tweening == 1) {
                this._container.pos(this._tweenStart.x + this._tweenChange.x, this._tweenStart.y + this._tweenChange.y);
                fgui.Events.dispatch(fgui.Events.SCROLL, this._owner.displayObject);
            }
            this._tweening = 0;
            Laya.timer.clear(this, this.tweenUpdate);
            this.updateScrollBarVisible();
            fgui.Events.dispatch(fgui.Events.SCROLL_END, this._owner.displayObject);
        }
        checkRefreshBar() {
            if (this._header == null && this._footer == null)
                return;
            var pos = this._container[this._refreshBarAxis];
            if (this._header != null) {
                if (pos > 0) {
                    if (this._header.displayObject.parent == null)
                        this._maskContainer.addChildAt(this._header.displayObject, 0);
                    var pt = ScrollPane.sHelperPoint;
                    pt.setTo(this._header.width, this._header.height);
                    pt[this._refreshBarAxis] = pos;
                    this._header.setSize(pt.x, pt.y);
                }
                else {
                    if (this._header.displayObject.parent != null)
                        this._maskContainer.removeChild(this._header.displayObject);
                }
            }
            if (this._footer != null) {
                var max = this._overlapSize[this._refreshBarAxis];
                if (pos < -max || max == 0 && this._footerLockedSize > 0) {
                    if (this._footer.displayObject.parent == null)
                        this._maskContainer.addChildAt(this._footer.displayObject, 0);
                    pt = ScrollPane.sHelperPoint;
                    pt.setTo(this._footer.x, this._footer.y);
                    if (max > 0)
                        pt[this._refreshBarAxis] = pos + this._contentSize[this._refreshBarAxis];
                    else
                        pt[this._refreshBarAxis] = Math.max(Math.min(pos + this._viewSize[this._refreshBarAxis], this._viewSize[this._refreshBarAxis] - this._footerLockedSize), this._viewSize[this._refreshBarAxis] - this._contentSize[this._refreshBarAxis]);
                    this._footer.setXY(pt.x, pt.y);
                    pt.setTo(this._footer.width, this._footer.height);
                    if (max > 0)
                        pt[this._refreshBarAxis] = -max - pos;
                    else
                        pt[this._refreshBarAxis] = this._viewSize[this._refreshBarAxis] - this._footer[this._refreshBarAxis];
                    this._footer.setSize(pt.x, pt.y);
                }
                else {
                    if (this._footer.displayObject.parent != null)
                        this._maskContainer.removeChild(this._footer.displayObject);
                }
            }
        }
        tweenUpdate() {
            var nx = this.runTween("x");
            var ny = this.runTween("y");
            this._container.pos(nx, ny);
            if (this._tweening == 2) {
                if (this._overlapSize.x > 0)
                    this._xPos = fgui.ToolSet.clamp(-nx, 0, this._overlapSize.x);
                if (this._overlapSize.y > 0)
                    this._yPos = fgui.ToolSet.clamp(-ny, 0, this._overlapSize.y);
                if (this._pageMode)
                    this.updatePageController();
            }
            if (this._tweenChange.x == 0 && this._tweenChange.y == 0) {
                this._tweening = 0;
                Laya.timer.clear(this, this.tweenUpdate);
                this.loopCheckingCurrent();
                this.updateScrollBarPos();
                this.updateScrollBarVisible();
                fgui.Events.dispatch(fgui.Events.SCROLL, this._owner.displayObject);
                fgui.Events.dispatch(fgui.Events.SCROLL_END, this._owner.displayObject);
            }
            else {
                this.updateScrollBarPos();
                fgui.Events.dispatch(fgui.Events.SCROLL, this._owner.displayObject);
            }
        }
        runTween(axis) {
            var newValue;
            if (this._tweenChange[axis] != 0) {
                this._tweenTime[axis] += Laya.timer.delta / 1000;
                if (this._tweenTime[axis] >= this._tweenDuration[axis]) {
                    newValue = this._tweenStart[axis] + this._tweenChange[axis];
                    this._tweenChange[axis] = 0;
                }
                else {
                    var ratio = ScrollPane.easeFunc(this._tweenTime[axis], this._tweenDuration[axis]);
                    newValue = this._tweenStart[axis] + Math.floor(this._tweenChange[axis] * ratio);
                }
                var threshold1 = 0;
                var threshold2 = -this._overlapSize[axis];
                if (this._headerLockedSize > 0 && this._refreshBarAxis == axis)
                    threshold1 = this._headerLockedSize;
                if (this._footerLockedSize > 0 && this._refreshBarAxis == axis) {
                    var max = this._overlapSize[this._refreshBarAxis];
                    if (max == 0)
                        max = Math.max(this._contentSize[this._refreshBarAxis] + this._footerLockedSize - this._viewSize[this._refreshBarAxis], 0);
                    else
                        max += this._footerLockedSize;
                    threshold2 = -max;
                }
                if (this._tweening == 2 && this._bouncebackEffect) {
                    if (newValue > 20 + threshold1 && this._tweenChange[axis] > 0
                        || newValue > threshold1 && this._tweenChange[axis] == 0) {
                        this._tweenTime[axis] = 0;
                        this._tweenDuration[axis] = ScrollPane.TWEEN_TIME_DEFAULT;
                        this._tweenChange[axis] = -newValue + threshold1;
                        this._tweenStart[axis] = newValue;
                    }
                    else if (newValue < threshold2 - 20 && this._tweenChange[axis] < 0
                        || newValue < threshold2 && this._tweenChange[axis] == 0) {
                        this._tweenTime[axis] = 0;
                        this._tweenDuration[axis] = ScrollPane.TWEEN_TIME_DEFAULT;
                        this._tweenChange[axis] = threshold2 - newValue;
                        this._tweenStart[axis] = newValue;
                    }
                }
                else {
                    if (newValue > threshold1) {
                        newValue = threshold1;
                        this._tweenChange[axis] = 0;
                    }
                    else if (newValue < threshold2) {
                        newValue = threshold2;
                        this._tweenChange[axis] = 0;
                    }
                }
            }
            else
                newValue = this._container[axis];
            return newValue;
        }
        static easeFunc(t, d) {
            return (t = t / d - 1) * t * t + 1;
        }
    }
    ScrollPane._gestureFlag = 0;
    ScrollPane.sHelperPoint = new Laya.Point();
    ScrollPane.sHelperRect = new Laya.Rectangle();
    ScrollPane.sEndPos = new Laya.Point();
    ScrollPane.sOldChange = new Laya.Point();
    ScrollPane.TWEEN_TIME_GO = 0.5;
    ScrollPane.TWEEN_TIME_DEFAULT = 0.3;
    ScrollPane.PULL_RATIO = 0.5;
    fgui.ScrollPane = ScrollPane;
})(fgui || (fgui = {}));

(function (fgui) {
    class Transition {
        constructor(owner) {
            this._owner = owner;
            this._items = new Array();
            this._totalDuration = 0;
            this._autoPlayTimes = 1;
            this._autoPlayDelay = 0;
            this._timeScale = 1;
            this._startTime = 0;
            this._endTime = 0;
        }
        play(onComplete = null, times = 1, delay = 0, startTime = 0, endTime = -1) {
            this._play(onComplete, times, delay, startTime, endTime, false);
        }
        playReverse(onComplete = null, times = 1, delay = 0, startTime = 0, endTime = -1) {
            this._play(onComplete, 1, delay, startTime, endTime, true);
        }
        changePlayTimes(value) {
            this._totalTimes = value;
        }
        setAutoPlay(value, times = 1, delay = 0) {
            if (this._autoPlay != value) {
                this._autoPlay = value;
                this._autoPlayTimes = times;
                this._autoPlayDelay = delay;
                if (this._autoPlay) {
                    if (this._owner.onStage)
                        this.play(null, null, this._autoPlayTimes, this._autoPlayDelay);
                }
                else {
                    if (!this._owner.onStage)
                        this.stop(false, true);
                }
            }
        }
        _play(onComplete = null, times = 1, delay = 0, startTime = 0, endTime = -1, reversed = false) {
            this.stop(true, true);
            this._totalTimes = times;
            this._reversed = reversed;
            this._startTime = startTime;
            this._endTime = endTime;
            this._playing = true;
            this._paused = false;
            this._onComplete = onComplete;
            var cnt = this._items.length;
            for (var i = 0; i < cnt; i++) {
                var item = this._items[i];
                if (item.target == null) {
                    if (item.targetId)
                        item.target = this._owner.getChildById(item.targetId);
                    else
                        item.target = this._owner;
                }
                else if (item.target != this._owner && item.target.parent != this._owner)
                    item.target = null;
                if (item.target != null && item.type == TransitionActionType.Transition) {
                    var trans = item.target.getTransition(item.value.transName);
                    if (trans == this)
                        trans = null;
                    if (trans != null) {
                        if (item.value.playTimes == 0) {
                            var j;
                            for (j = i - 1; j >= 0; j--) {
                                var item2 = this._items[j];
                                if (item2.type == TransitionActionType.Transition) {
                                    if (item2.value.trans == trans) {
                                        item2.value.stopTime = item.time - item2.time;
                                        break;
                                    }
                                }
                            }
                            if (j < 0)
                                item.value.stopTime = 0;
                            else
                                trans = null;
                        }
                        else
                            item.value.stopTime = -1;
                    }
                    item.value.trans = trans;
                }
            }
            if (delay == 0)
                this.onDelayedPlay();
            else
                fgui.GTween.delayedCall(delay).onComplete(this.onDelayedPlay, this);
        }
        stop(setToComplete = true, processCallback = false) {
            if (!this._playing)
                return;
            this._playing = false;
            this._totalTasks = 0;
            this._totalTimes = 0;
            var handler = this._onComplete;
            this._onComplete = null;
            fgui.GTween.kill(this);
            var cnt = this._items.length;
            if (this._reversed) {
                for (var i = cnt - 1; i >= 0; i--) {
                    var item = this._items[i];
                    if (item.target == null)
                        continue;
                    this.stopItem(item, setToComplete);
                }
            }
            else {
                for (i = 0; i < cnt; i++) {
                    item = this._items[i];
                    if (item.target == null)
                        continue;
                    this.stopItem(item, setToComplete);
                }
            }
            if (processCallback && handler != null) {
                handler.run();
            }
        }
        stopItem(item, setToComplete) {
            if (item.displayLockToken != 0) {
                item.target.releaseDisplayLock(item.displayLockToken);
                item.displayLockToken = 0;
            }
            if (item.tweener != null) {
                item.tweener.kill(setToComplete);
                item.tweener = null;
                if (item.type == TransitionActionType.Shake && !setToComplete) {
                    item.target._gearLocked = true;
                    item.target.setXY(item.target.x - item.value.lastOffsetX, item.target.y - item.value.lastOffsetY);
                    item.target._gearLocked = false;
                }
            }
            if (item.type == TransitionActionType.Transition) {
                var trans = item.value.trans;
                if (trans != null)
                    trans.stop(setToComplete, false);
            }
        }
        setPaused(paused) {
            if (!this._playing || this._paused == paused)
                return;
            this._paused = paused;
            var tweener = fgui.GTween.getTween(this);
            if (tweener != null)
                tweener.setPaused(paused);
            var cnt = this._items.length;
            for (var i = 0; i < cnt; i++) {
                var item = this._items[i];
                if (item.target == null)
                    continue;
                if (item.type == TransitionActionType.Transition) {
                    if (item.value.trans != null)
                        item.value.trans.setPaused(paused);
                }
                else if (item.type == TransitionActionType.Animation) {
                    if (paused) {
                        item.value.flag = item.target.getProp(fgui.ObjectPropID.Playing);
                        item.target.setProp(fgui.ObjectPropID.Playing, false);
                    }
                    else
                        item.target.setProp(fgui.ObjectPropID.Playing, item.value.flag);
                }
                if (item.tweener != null)
                    item.tweener.setPaused(paused);
            }
        }
        dispose() {
            if (this._playing)
                fgui.GTween.kill(this);
            var cnt = this._items.length;
            for (var i = 0; i < cnt; i++) {
                var item = this._items[i];
                if (item.tweener != null) {
                    item.tweener.kill();
                    item.tweener = null;
                }
                item.target = null;
                item.hook = null;
                if (item.tweenConfig != null)
                    item.tweenConfig.endHook = null;
            }
            this._items.length = 0;
            this._playing = false;
            this._onComplete = null;
        }
        get playing() {
            return this._playing;
        }
        setValue(label, ...args) {
            var cnt = this._items.length;
            var found = false;
            var value;
            for (var i = 0; i < cnt; i++) {
                var item = this._items[i];
                if (item.label == label) {
                    if (item.tweenConfig != null)
                        value = item.tweenConfig.startValue;
                    else
                        value = item.value;
                    found = true;
                }
                else if (item.tweenConfig != null && item.tweenConfig.endLabel == label) {
                    value = item.tweenConfig.endValue;
                    found = true;
                }
                else
                    continue;
                switch (item.type) {
                    case TransitionActionType.XY:
                    case TransitionActionType.Size:
                    case TransitionActionType.Pivot:
                    case TransitionActionType.Scale:
                    case TransitionActionType.Skew:
                        value.b1 = true;
                        value.b2 = true;
                        value.f1 = parseFloat(args[0]);
                        value.f2 = parseFloat(args[1]);
                        break;
                    case TransitionActionType.Alpha:
                        value.f1 = parseFloat(args[0]);
                        break;
                    case TransitionActionType.Rotation:
                        value.f1 = parseFloat(args[0]);
                        break;
                    case TransitionActionType.Color:
                        value.f1 = parseFloat(args[0]);
                        break;
                    case TransitionActionType.Animation:
                        value.frame = parseInt(args[0]);
                        if (args.length > 1)
                            value.playing = args[1];
                        break;
                    case TransitionActionType.Visible:
                        value.visible = args[0];
                        break;
                    case TransitionActionType.Sound:
                        value.sound = args[0];
                        if (args.length > 1)
                            value.volume = parseFloat(args[1]);
                        break;
                    case TransitionActionType.Transition:
                        value.transName = args[0];
                        if (args.length > 1)
                            value.playTimes = parseInt(args[1]);
                        break;
                    case TransitionActionType.Shake:
                        value.amplitude = parseFloat(args[0]);
                        if (args.length > 1)
                            value.duration = parseFloat(args[1]);
                        break;
                    case TransitionActionType.ColorFilter:
                        value.f1 = parseFloat(args[0]);
                        value.f2 = parseFloat(args[1]);
                        value.f3 = parseFloat(args[2]);
                        value.f4 = parseFloat(args[3]);
                        break;
                    case TransitionActionType.Text:
                    case TransitionActionType.Icon:
                        value.text = args[0];
                        break;
                }
            }
            if (!found)
                throw new Error("this.label not exists");
        }
        setHook(label, callback) {
            var cnt = this._items.length;
            var found = false;
            for (var i = 0; i < cnt; i++) {
                var item = this._items[i];
                if (item.label == label) {
                    item.hook = callback;
                    found = true;
                    break;
                }
                else if (item.tweenConfig != null && item.tweenConfig.endLabel == label) {
                    item.tweenConfig.endHook = callback;
                    found = true;
                    break;
                }
            }
            if (!found)
                throw new Error("this.label not exists");
        }
        clearHooks() {
            var cnt = this._items.length;
            for (var i = 0; i < cnt; i++) {
                var item = this._items[i];
                item.hook = null;
                if (item.tweenConfig != null)
                    item.tweenConfig.endHook = null;
            }
        }
        setTarget(label, newTarget) {
            var cnt = this._items.length;
            var found = false;
            for (var i = 0; i < cnt; i++) {
                var item = this._items[i];
                if (item.label == label) {
                    item.targetId = (newTarget == this._owner || newTarget == null) ? "" : newTarget.id;
                    if (this._playing) {
                        if (item.targetId.length > 0)
                            item.target = this._owner.getChildById(item.targetId);
                        else
                            item.target = this._owner;
                    }
                    else
                        item.target = null;
                    found = true;
                }
            }
            if (!found)
                throw new Error("this.label not exists");
        }
        setDuration(label, value) {
            var cnt = this._items.length;
            var found = false;
            for (var i = 0; i < cnt; i++) {
                var item = this._items[i];
                if (item.tweenConfig != null && item.label == label) {
                    item.tweenConfig.duration = value;
                    found = true;
                }
            }
            if (!found)
                throw new Error("this.label not exists");
        }
        getLabelTime(label) {
            var cnt = this._items.length;
            for (var i = 0; i < cnt; i++) {
                var item = this._items[i];
                if (item.label == label)
                    return item.time;
                else if (item.tweenConfig != null && item.tweenConfig.endLabel == label)
                    return item.time + item.tweenConfig.duration;
            }
            return NaN;
        }
        get timeScale() {
            return this._timeScale;
        }
        set timeScale(value) {
            if (this._timeScale != value) {
                this._timeScale = value;
                if (this._playing) {
                    var cnt = this._items.length;
                    for (var i = 0; i < cnt; i++) {
                        var item = this._items[i];
                        if (item.tweener != null)
                            item.tweener.setTimeScale(value);
                        else if (item.type == TransitionActionType.Transition) {
                            if (item.value.trans != null)
                                item.value.trans.timeScale = value;
                        }
                        else if (item.type == TransitionActionType.Animation) {
                            if (item.target != null)
                                item.target.setProp(fgui.ObjectPropID.TimeScale, value);
                        }
                    }
                }
            }
        }
        updateFromRelations(targetId, dx, dy) {
            var cnt = this._items.length;
            if (cnt == 0)
                return;
            for (var i = 0; i < cnt; i++) {
                var item = this._items[i];
                if (item.type == TransitionActionType.XY && item.targetId == targetId) {
                    if (item.tweenConfig != null) {
                        if (!item.tweenConfig.startValue.b3) {
                            item.tweenConfig.startValue.f1 += dx;
                            item.tweenConfig.startValue.f2 += dy;
                        }
                        if (!item.tweenConfig.endValue.b3) {
                            item.tweenConfig.endValue.f1 += dx;
                            item.tweenConfig.endValue.f2 += dy;
                        }
                    }
                    else {
                        if (!item.value.b3) {
                            item.value.f1 += dx;
                            item.value.f2 += dy;
                        }
                    }
                }
            }
        }
        onOwnerAddedToStage() {
            if (this._autoPlay && !this._playing)
                this.play(null, this._autoPlayTimes, this._autoPlayDelay);
        }
        onOwnerRemovedFromStage() {
            if ((this._options & Transition.OPTION_AUTO_STOP_DISABLED) == 0)
                this.stop((this._options & Transition.OPTION_AUTO_STOP_AT_END) != 0 ? true : false, false);
        }
        onDelayedPlay() {
            this.internalPlay();
            this._playing = this._totalTasks > 0;
            if (this._playing) {
                if ((this._options & Transition.OPTION_IGNORE_DISPLAY_CONTROLLER) != 0) {
                    var cnt = this._items.length;
                    for (var i = 0; i < cnt; i++) {
                        var item = this._items[i];
                        if (item.target != null && item.target != this._owner)
                            item.displayLockToken = item.target.addDisplayLock();
                    }
                }
            }
            else if (this._onComplete != null) {
                var handler = this._onComplete;
                this._onComplete = null;
                handler.run();
            }
        }
        internalPlay() {
            this._ownerBaseX = this._owner.x;
            this._ownerBaseY = this._owner.y;
            this._totalTasks = 0;
            var cnt = this._items.length;
            var item;
            var needSkipAnimations = false;
            if (!this._reversed) {
                for (var i = 0; i < cnt; i++) {
                    item = this._items[i];
                    if (item.target == null)
                        continue;
                    if (item.type == TransitionActionType.Animation && this._startTime != 0 && item.time <= this._startTime) {
                        needSkipAnimations = true;
                        item.value.flag = false;
                    }
                    else
                        this.playItem(item);
                }
            }
            else {
                for (i = cnt - 1; i >= 0; i--) {
                    item = this._items[i];
                    if (item.target == null)
                        continue;
                    this.playItem(item);
                }
            }
            if (needSkipAnimations)
                this.skipAnimations();
        }
        playItem(item) {
            var time;
            if (item.tweenConfig != null) {
                if (this._reversed)
                    time = (this._totalDuration - item.time - item.tweenConfig.duration);
                else
                    time = item.time;
                if (this._endTime == -1 || time <= this._endTime) {
                    var startValue;
                    var endValue;
                    if (this._reversed) {
                        startValue = item.tweenConfig.endValue;
                        endValue = item.tweenConfig.startValue;
                    }
                    else {
                        startValue = item.tweenConfig.startValue;
                        endValue = item.tweenConfig.endValue;
                    }
                    item.value.b1 = startValue.b1 || endValue.b1;
                    item.value.b2 = startValue.b2 || endValue.b2;
                    switch (item.type) {
                        case TransitionActionType.XY:
                        case TransitionActionType.Size:
                        case TransitionActionType.Scale:
                        case TransitionActionType.Skew:
                            item.tweener = fgui.GTween.to2(startValue.f1, startValue.f2, endValue.f1, endValue.f2, item.tweenConfig.duration);
                            break;
                        case TransitionActionType.Alpha:
                        case TransitionActionType.Rotation:
                            item.tweener = fgui.GTween.to(startValue.f1, endValue.f1, item.tweenConfig.duration);
                            break;
                        case TransitionActionType.Color:
                            item.tweener = fgui.GTween.toColor(startValue.f1, endValue.f1, item.tweenConfig.duration);
                            break;
                        case TransitionActionType.ColorFilter:
                            item.tweener = fgui.GTween.to4(startValue.f1, startValue.f2, startValue.f3, startValue.f4, endValue.f1, endValue.f2, endValue.f3, endValue.f4, item.tweenConfig.duration);
                            break;
                    }
                    item.tweener.setDelay(time)
                        .setEase(item.tweenConfig.easeType)
                        .setRepeat(item.tweenConfig.repeat, item.tweenConfig.yoyo)
                        .setTimeScale(this._timeScale)
                        .setTarget(item)
                        .onStart(this.onTweenStart, this)
                        .onUpdate(this.onTweenUpdate, this)
                        .onComplete(this.onTweenComplete, this);
                    if (this._endTime >= 0)
                        item.tweener.setBreakpoint(this._endTime - time);
                    this._totalTasks++;
                }
            }
            else if (item.type == TransitionActionType.Shake) {
                if (this._reversed)
                    time = (this._totalDuration - item.time - item.value.duration);
                else
                    time = item.time;
                item.value.offsetX = item.value.offsetY = 0;
                item.value.lastOffsetX = item.value.lastOffsetY = 0;
                item.tweener = fgui.GTween.shake(0, 0, item.value.amplitude, item.value.duration)
                    .setDelay(time)
                    .setTimeScale(this._timeScale)
                    .setTarget(item)
                    .onUpdate(this.onTweenUpdate, this)
                    .onComplete(this.onTweenComplete, this);
                if (this._endTime >= 0)
                    item.tweener.setBreakpoint(this._endTime - item.time);
                this._totalTasks++;
            }
            else {
                if (this._reversed)
                    time = (this._totalDuration - item.time);
                else
                    time = item.time;
                if (time <= this._startTime) {
                    this.applyValue(item);
                    this.callHook(item, false);
                }
                else if (this._endTime == -1 || time <= this._endTime) {
                    this._totalTasks++;
                    item.tweener = fgui.GTween.delayedCall(time)
                        .setTimeScale(this._timeScale)
                        .setTarget(item)
                        .onComplete(this.onDelayedPlayItem, this);
                }
            }
            if (item.tweener != null)
                item.tweener.seek(this._startTime);
        }
        skipAnimations() {
            var frame;
            var playStartTime;
            var playTotalTime;
            var value;
            var target;
            var item;
            var cnt = this._items.length;
            for (var i = 0; i < cnt; i++) {
                item = this._items[i];
                if (item.type != TransitionActionType.Animation || item.time > this._startTime)
                    continue;
                value = item.value;
                if (value.flag)
                    continue;
                target = item.target;
                frame = target.getProp(fgui.ObjectPropID.Frame);
                playStartTime = target.getProp(fgui.ObjectPropID.Playing) ? 0 : -1;
                playTotalTime = 0;
                for (var j = i; j < cnt; j++) {
                    item = this._items[j];
                    if (item.type != TransitionActionType.Animation || item.target != target || item.time > this._startTime)
                        continue;
                    value = item.value;
                    value.flag = true;
                    if (value.frame != -1) {
                        frame = value.frame;
                        if (value.playing)
                            playStartTime = item.time;
                        else
                            playStartTime = -1;
                        playTotalTime = 0;
                    }
                    else {
                        if (value.playing) {
                            if (playStartTime < 0)
                                playStartTime = item.time;
                        }
                        else {
                            if (playStartTime >= 0)
                                playTotalTime += (item.time - playStartTime);
                            playStartTime = -1;
                        }
                    }
                    this.callHook(item, false);
                }
                if (playStartTime >= 0)
                    playTotalTime += (this._startTime - playStartTime);
                target.setProp(fgui.ObjectPropID.Playing, playStartTime >= 0);
                target.setProp(fgui.ObjectPropID.Frame, frame);
                if (playTotalTime > 0)
                    target.setProp(fgui.ObjectPropID.DeltaTime, playTotalTime * 1000);
            }
        }
        onDelayedPlayItem(tweener) {
            var item = tweener.target;
            item.tweener = null;
            this._totalTasks--;
            this.applyValue(item);
            this.callHook(item, false);
            this.checkAllComplete();
        }
        onTweenStart(tweener) {
            var item = tweener.target;
            if (item.type == TransitionActionType.XY || item.type == TransitionActionType.Size) {
                var startValue;
                var endValue;
                if (this._reversed) {
                    startValue = item.tweenConfig.endValue;
                    endValue = item.tweenConfig.startValue;
                }
                else {
                    startValue = item.tweenConfig.startValue;
                    endValue = item.tweenConfig.endValue;
                }
                if (item.type == TransitionActionType.XY) {
                    if (item.target != this._owner) {
                        if (!startValue.b1)
                            tweener.startValue.x = item.target.x;
                        else if (startValue.b3)
                            tweener.startValue.x = startValue.f1 * this._owner.width;
                        if (!startValue.b2)
                            tweener.startValue.y = item.target.y;
                        else if (startValue.b3)
                            tweener.startValue.y = startValue.f2 * this._owner.height;
                        if (!endValue.b1)
                            tweener.endValue.x = tweener.startValue.x;
                        else if (endValue.b3)
                            tweener.endValue.x = endValue.f1 * this._owner.width;
                        if (!endValue.b2)
                            tweener.endValue.y = tweener.startValue.y;
                        else if (endValue.b3)
                            tweener.endValue.y = endValue.f2 * this._owner.height;
                    }
                    else {
                        if (!startValue.b1)
                            tweener.startValue.x = item.target.x - this._ownerBaseX;
                        if (!startValue.b2)
                            tweener.startValue.y = item.target.y - this._ownerBaseY;
                        if (!endValue.b1)
                            tweener.endValue.x = tweener.startValue.x;
                        if (!endValue.b2)
                            tweener.endValue.y = tweener.startValue.y;
                    }
                }
                else {
                    if (!startValue.b1)
                        tweener.startValue.x = item.target.width;
                    if (!startValue.b2)
                        tweener.startValue.y = item.target.height;
                    if (!endValue.b1)
                        tweener.endValue.x = tweener.startValue.x;
                    if (!endValue.b2)
                        tweener.endValue.y = tweener.startValue.y;
                }
                if (item.tweenConfig.path) {
                    item.value.b1 = item.value.b2 = true;
                    tweener.setPath(item.tweenConfig.path);
                }
            }
            this.callHook(item, false);
        }
        onTweenUpdate(tweener) {
            var item = tweener.target;
            switch (item.type) {
                case TransitionActionType.XY:
                case TransitionActionType.Size:
                case TransitionActionType.Scale:
                case TransitionActionType.Skew:
                    item.value.f1 = tweener.value.x;
                    item.value.f2 = tweener.value.y;
                    if (item.tweenConfig.path) {
                        item.value.f1 += tweener.startValue.x;
                        item.value.f2 += tweener.startValue.y;
                    }
                    break;
                case TransitionActionType.Alpha:
                case TransitionActionType.Rotation:
                    item.value.f1 = tweener.value.x;
                    break;
                case TransitionActionType.Color:
                    item.value.f1 = tweener.value.color;
                    break;
                case TransitionActionType.ColorFilter:
                    item.value.f1 = tweener.value.x;
                    item.value.f2 = tweener.value.y;
                    item.value.f3 = tweener.value.z;
                    item.value.f4 = tweener.value.w;
                    break;
                case TransitionActionType.Shake:
                    item.value.offsetX = tweener.deltaValue.x;
                    item.value.offsetY = tweener.deltaValue.y;
                    break;
            }
            this.applyValue(item);
        }
        onTweenComplete(tweener) {
            var item = tweener.target;
            item.tweener = null;
            this._totalTasks--;
            if (tweener.allCompleted)
                this.callHook(item, true);
            this.checkAllComplete();
        }
        onPlayTransCompleted(item) {
            this._totalTasks--;
            this.checkAllComplete();
        }
        callHook(item, tweenEnd) {
            if (tweenEnd) {
                if (item.tweenConfig != null && item.tweenConfig.endHook != null)
                    item.tweenConfig.endHook.run();
            }
            else {
                if (item.time >= this._startTime && item.hook != null)
                    item.hook.run();
            }
        }
        checkAllComplete() {
            if (this._playing && this._totalTasks == 0) {
                if (this._totalTimes < 0) {
                    this.internalPlay();
                }
                else {
                    this._totalTimes--;
                    if (this._totalTimes > 0)
                        this.internalPlay();
                    else {
                        this._playing = false;
                        var cnt = this._items.length;
                        for (var i = 0; i < cnt; i++) {
                            var item = this._items[i];
                            if (item.target != null && item.displayLockToken != 0) {
                                item.target.releaseDisplayLock(item.displayLockToken);
                                item.displayLockToken = 0;
                            }
                        }
                        if (this._onComplete != null) {
                            var handler = this._onComplete;
                            this._onComplete = null;
                            handler.run();
                        }
                    }
                }
            }
        }
        applyValue(item) {
            item.target._gearLocked = true;
            var value = item.value;
            switch (item.type) {
                case TransitionActionType.XY:
                    if (item.target == this._owner) {
                        if (value.b1 && value.b2)
                            item.target.setXY(value.f1 + this._ownerBaseX, value.f2 + this._ownerBaseY);
                        else if (value.b1)
                            item.target.x = value.f1 + this._ownerBaseX;
                        else
                            item.target.y = value.f2 + this._ownerBaseY;
                    }
                    else {
                        if (value.b3) {
                            if (value.b1 && value.b2)
                                item.target.setXY(value.f1 * this._owner.width, value.f2 * this._owner.height);
                            else if (value.b1)
                                item.target.x = value.f1 * this._owner.width;
                            else if (value.b2)
                                item.target.y = value.f2 * this._owner.height;
                        }
                        else {
                            if (value.b1 && value.b2)
                                item.target.setXY(value.f1, value.f2);
                            else if (value.b1)
                                item.target.x = value.f1;
                            else if (value.b2)
                                item.target.y = value.f2;
                        }
                    }
                    break;
                case TransitionActionType.Size:
                    if (!value.b1)
                        value.f1 = item.target.width;
                    if (!value.b2)
                        value.f2 = item.target.height;
                    item.target.setSize(value.f1, value.f2);
                    break;
                case TransitionActionType.Pivot:
                    item.target.setPivot(value.f1, value.f2, item.target.pivotAsAnchor);
                    break;
                case TransitionActionType.Alpha:
                    item.target.alpha = value.f1;
                    break;
                case TransitionActionType.Rotation:
                    item.target.rotation = value.f1;
                    break;
                case TransitionActionType.Scale:
                    item.target.setScale(value.f1, value.f2);
                    break;
                case TransitionActionType.Skew:
                    item.target.setSkew(value.f1, value.f2);
                    break;
                case TransitionActionType.Color:
                    item.target.setProp(fgui.ObjectPropID.Color, fgui.ToolSet.convertToHtmlColor(value.f1, false));
                    break;
                case TransitionActionType.Animation:
                    if (value.frame >= 0)
                        item.target.setProp(fgui.ObjectPropID.Frame, value.frame);
                    item.target.setProp(fgui.ObjectPropID.Playing, value.playing);
                    item.target.setProp(fgui.ObjectPropID.TimeScale, this._timeScale);
                    break;
                case TransitionActionType.Visible:
                    item.target.visible = value.visible;
                    break;
                case TransitionActionType.Transition:
                    if (this._playing) {
                        var trans = value.trans;
                        if (trans != null) {
                            this._totalTasks++;
                            var startTime = this._startTime > item.time ? (this._startTime - item.time) : 0;
                            var endTime = this._endTime >= 0 ? (this._endTime - item.time) : -1;
                            if (value.stopTime >= 0 && (endTime < 0 || endTime > value.stopTime))
                                endTime = value.stopTime;
                            trans.timeScale = this._timeScale;
                            trans._play(Laya.Handler.create(this, this.onPlayTransCompleted, [item]), value.playTimes, 0, startTime, endTime, this._reversed);
                        }
                    }
                    break;
                case TransitionActionType.Sound:
                    if (this._playing && item.time >= this._startTime) {
                        if (value.audioClip == null) {
                            var pi = fgui.UIPackage.getItemByURL(value.sound);
                            if (pi)
                                value.audioClip = pi.file;
                            else
                                value.audioClip = value.sound;
                        }
                        if (value.audioClip)
                            fgui.GRoot.inst.playOneShotSound(value.audioClip, value.volume);
                    }
                    break;
                case TransitionActionType.Shake:
                    item.target.setXY(item.target.x - value.lastOffsetX + value.offsetX, item.target.y - value.lastOffsetY + value.offsetY);
                    value.lastOffsetX = value.offsetX;
                    value.lastOffsetY = value.offsetY;
                    break;
                case TransitionActionType.ColorFilter:
                    {
                        fgui.ToolSet.setColorFilter(item.target.displayObject, [value.f1, value.f2, value.f3, value.f4]);
                        break;
                    }
                case TransitionActionType.Text:
                    item.target.text = value.text;
                    break;
                case TransitionActionType.Icon:
                    item.target.icon = value.text;
                    break;
            }
            item.target._gearLocked = false;
        }
        setup(buffer) {
            this.name = buffer.readS();
            this._options = buffer.getInt32();
            this._autoPlay = buffer.readBool();
            this._autoPlayTimes = buffer.getInt32();
            this._autoPlayDelay = buffer.getFloat32();
            var cnt = buffer.getInt16();
            for (var i = 0; i < cnt; i++) {
                var dataLen = buffer.getInt16();
                var curPos = buffer.pos;
                buffer.seek(curPos, 0);
                var item = new TransitionItem(buffer.readByte());
                this._items[i] = item;
                item.time = buffer.getFloat32();
                var targetId = buffer.getInt16();
                if (targetId < 0)
                    item.targetId = "";
                else
                    item.targetId = this._owner.getChildAt(targetId).id;
                item.label = buffer.readS();
                if (buffer.readBool()) {
                    buffer.seek(curPos, 1);
                    item.tweenConfig = new TweenConfig();
                    item.tweenConfig.duration = buffer.getFloat32();
                    if (item.time + item.tweenConfig.duration > this._totalDuration)
                        this._totalDuration = item.time + item.tweenConfig.duration;
                    item.tweenConfig.easeType = buffer.readByte();
                    item.tweenConfig.repeat = buffer.getInt32();
                    item.tweenConfig.yoyo = buffer.readBool();
                    item.tweenConfig.endLabel = buffer.readS();
                    buffer.seek(curPos, 2);
                    this.decodeValue(item, buffer, item.tweenConfig.startValue);
                    buffer.seek(curPos, 3);
                    this.decodeValue(item, buffer, item.tweenConfig.endValue);
                    if (buffer.version >= 2) {
                        var pathLen = buffer.getInt32();
                        if (pathLen > 0) {
                            item.tweenConfig.path = new fgui.GPath();
                            var pts = new Array();
                            for (var j = 0; j < pathLen; j++) {
                                var curveType = buffer.getUint8();
                                switch (curveType) {
                                    case fgui.CurveType.Bezier:
                                        pts.push(fgui.GPathPoint.newBezierPoint(buffer.getFloat32(), buffer.getFloat32(), buffer.getFloat32(), buffer.getFloat32()));
                                        break;
                                    case fgui.CurveType.CubicBezier:
                                        pts.push(fgui.GPathPoint.newCubicBezierPoint(buffer.getFloat32(), buffer.getFloat32(), buffer.getFloat32(), buffer.getFloat32(), buffer.getFloat32(), buffer.getFloat32()));
                                        break;
                                    default:
                                        pts.push(fgui.GPathPoint.newPoint(buffer.getFloat32(), buffer.getFloat32(), curveType));
                                        break;
                                }
                            }
                            item.tweenConfig.path.create(pts);
                        }
                    }
                }
                else {
                    if (item.time > this._totalDuration)
                        this._totalDuration = item.time;
                    buffer.seek(curPos, 2);
                    this.decodeValue(item, buffer, item.value);
                }
                buffer.pos = curPos + dataLen;
            }
        }
        decodeValue(item, buffer, value) {
            switch (item.type) {
                case TransitionActionType.XY:
                case TransitionActionType.Size:
                case TransitionActionType.Pivot:
                case TransitionActionType.Skew:
                    value.b1 = buffer.readBool();
                    value.b2 = buffer.readBool();
                    value.f1 = buffer.getFloat32();
                    value.f2 = buffer.getFloat32();
                    if (buffer.version >= 2 && item.type == TransitionActionType.XY)
                        value.b3 = buffer.readBool();
                    break;
                case TransitionActionType.Alpha:
                case TransitionActionType.Rotation:
                    value.f1 = buffer.getFloat32();
                    break;
                case TransitionActionType.Scale:
                    value.f1 = buffer.getFloat32();
                    value.f2 = buffer.getFloat32();
                    break;
                case TransitionActionType.Color:
                    value.f1 = buffer.readColor();
                    break;
                case TransitionActionType.Animation:
                    value.playing = buffer.readBool();
                    value.frame = buffer.getInt32();
                    break;
                case TransitionActionType.Visible:
                    value.visible = buffer.readBool();
                    break;
                case TransitionActionType.Sound:
                    value.sound = buffer.readS();
                    value.volume = buffer.getFloat32();
                    break;
                case TransitionActionType.Transition:
                    value.transName = buffer.readS();
                    value.playTimes = buffer.getInt32();
                    break;
                case TransitionActionType.Shake:
                    value.amplitude = buffer.getFloat32();
                    value.duration = buffer.getFloat32();
                    break;
                case TransitionActionType.ColorFilter:
                    value.f1 = buffer.getFloat32();
                    value.f2 = buffer.getFloat32();
                    value.f3 = buffer.getFloat32();
                    value.f4 = buffer.getFloat32();
                    break;
                case TransitionActionType.Text:
                case TransitionActionType.Icon:
                    value.text = buffer.readS();
                    break;
            }
        }
    }
    Transition.OPTION_IGNORE_DISPLAY_CONTROLLER = 1;
    Transition.OPTION_AUTO_STOP_DISABLED = 2;
    Transition.OPTION_AUTO_STOP_AT_END = 4;
    fgui.Transition = Transition;
    class TransitionActionType {
    }
    TransitionActionType.XY = 0;
    TransitionActionType.Size = 1;
    TransitionActionType.Scale = 2;
    TransitionActionType.Pivot = 3;
    TransitionActionType.Alpha = 4;
    TransitionActionType.Rotation = 5;
    TransitionActionType.Color = 6;
    TransitionActionType.Animation = 7;
    TransitionActionType.Visible = 8;
    TransitionActionType.Sound = 9;
    TransitionActionType.Transition = 10;
    TransitionActionType.Shake = 11;
    TransitionActionType.ColorFilter = 12;
    TransitionActionType.Skew = 13;
    TransitionActionType.Text = 14;
    TransitionActionType.Icon = 15;
    TransitionActionType.Unknown = 16;
    class TransitionItem {
        constructor(type) {
            this.type = type;
            switch (type) {
                case TransitionActionType.XY:
                case TransitionActionType.Size:
                case TransitionActionType.Scale:
                case TransitionActionType.Pivot:
                case TransitionActionType.Skew:
                case TransitionActionType.Alpha:
                case TransitionActionType.Rotation:
                case TransitionActionType.Color:
                case TransitionActionType.ColorFilter:
                    this.value = new TValue();
                    break;
                case TransitionActionType.Animation:
                    this.value = new TValue_Animation();
                    break;
                case TransitionActionType.Shake:
                    this.value = new TValue_Shake();
                    break;
                case TransitionActionType.Sound:
                    this.value = new TValue_Sound();
                    break;
                case TransitionActionType.Transition:
                    this.value = new TValue_Transition();
                    break;
                case TransitionActionType.Visible:
                    this.value = new TValue_Visible();
                    break;
                case TransitionActionType.Text:
                case TransitionActionType.Icon:
                    this.value = new TValue_Text();
                    break;
            }
        }
    }
    class TweenConfig {
        constructor() {
            this.easeType = fgui.EaseType.QuadOut;
            this.startValue = new TValue();
            this.endValue = new TValue();
        }
    }
    class TValue_Visible {
    }
    class TValue_Animation {
    }
    class TValue_Sound {
    }
    class TValue_Transition {
    }
    class TValue_Shake {
    }
    class TValue_Text {
    }
    class TValue {
        constructor() {
            this.b1 = this.b2 = true;
        }
    }
})(fgui || (fgui = {}));

(function (fgui) {
    class TranslationHelper {
        constructor() {
        }
        static loadFromXML(source) {
            TranslationHelper.strings = {};
            var xml = Laya.Utils.parseXMLFromString(source);
            var resNode = TranslationHelper.findChildNode(xml, "resources");
            var nodes = resNode.childNodes;
            var length1 = nodes.length;
            for (var i1 = 0; i1 < length1; i1++) {
                var cxml = nodes[i1];
                if (cxml.nodeName == "string") {
                    var key = cxml.getAttribute("name");
                    var text = cxml.textContent;
                    var i = key.indexOf("-");
                    if (i == -1)
                        continue;
                    var key2 = key.substr(0, i);
                    var key3 = key.substr(i + 1);
                    var col = TranslationHelper.strings[key2];
                    if (!col) {
                        col = {};
                        TranslationHelper.strings[key2] = col;
                    }
                    col[key3] = text;
                }
            }
        }
        static translateComponent(item) {
            if (TranslationHelper.strings == null)
                return;
            var compStrings = TranslationHelper.strings[item.owner.id + item.id];
            if (compStrings == null)
                return;
            var elementId, value;
            var buffer = item.rawData;
            var nextPos;
            var itemCount;
            var i, j, k;
            var dataLen;
            var curPos;
            var valueCnt;
            var page;
            buffer.seek(0, 2);
            var childCount = buffer.getInt16();
            for (i = 0; i < childCount; i++) {
                dataLen = buffer.getInt16();
                curPos = buffer.pos;
                buffer.seek(curPos, 0);
                var baseType = buffer.readByte();
                var type = baseType;
                buffer.skip(4);
                elementId = buffer.readS();
                if (type == fgui.ObjectType.Component) {
                    if (buffer.seek(curPos, 6))
                        type = buffer.readByte();
                }
                buffer.seek(curPos, 1);
                if ((value = compStrings[elementId + "-tips"]) != null)
                    buffer.writeS(value);
                buffer.seek(curPos, 2);
                var gearCnt = buffer.getInt16();
                for (j = 0; j < gearCnt; j++) {
                    nextPos = buffer.getInt16();
                    nextPos += buffer.pos;
                    if (buffer.readByte() == 6) {
                        buffer.skip(2);
                        valueCnt = buffer.getInt16();
                        for (k = 0; k < valueCnt; k++) {
                            page = buffer.readS();
                            if (page != null) {
                                if ((value = compStrings[elementId + "-texts_" + k]) != null)
                                    buffer.writeS(value);
                                else
                                    buffer.skip(2);
                            }
                        }
                        if (buffer.readBool() && (value = compStrings[elementId + "-texts_def"]) != null)
                            buffer.writeS(value);
                    }
                    buffer.pos = nextPos;
                }
                if (baseType == fgui.ObjectType.Component && buffer.version >= 2) {
                    buffer.seek(curPos, 4);
                    buffer.skip(2);
                    buffer.skip(4 * buffer.getUint16());
                    var cpCount = buffer.getUint16();
                    for (var k = 0; k < cpCount; k++) {
                        var target = buffer.readS();
                        var propertyId = buffer.getUint16();
                        if (propertyId == 0 && (value = compStrings[elementId + "-cp-" + target]) != null)
                            buffer.writeS(value);
                        else
                            buffer.skip(2);
                    }
                }
                switch (type) {
                    case fgui.ObjectType.Text:
                    case fgui.ObjectType.RichText:
                    case fgui.ObjectType.InputText:
                        {
                            if ((value = compStrings[elementId]) != null) {
                                buffer.seek(curPos, 6);
                                buffer.writeS(value);
                            }
                            if ((value = compStrings[elementId + "-prompt"]) != null) {
                                buffer.seek(curPos, 4);
                                buffer.writeS(value);
                            }
                            break;
                        }
                    case fgui.ObjectType.List:
                    case fgui.ObjectType.Tree:
                        {
                            buffer.seek(curPos, 8);
                            buffer.skip(2);
                            itemCount = buffer.getUint16();
                            for (j = 0; j < itemCount; j++) {
                                nextPos = buffer.getUint16();
                                nextPos += buffer.pos;
                                buffer.skip(2);
                                if (type == fgui.ObjectType.Tree)
                                    buffer.skip(2);
                                if ((value = compStrings[elementId + "-" + j]) != null)
                                    buffer.writeS(value);
                                else
                                    buffer.skip(2);
                                if ((value = compStrings[elementId + "-" + j + "-0"]) != null)
                                    buffer.writeS(value);
                                if (buffer.version >= 2) {
                                    buffer.skip(6);
                                    buffer.skip(buffer.getUint16() * 4);
                                    var cpCount = buffer.getUint16();
                                    for (var k = 0; k < cpCount; k++) {
                                        var target = buffer.readS();
                                        var propertyId = buffer.getUint16();
                                        if (propertyId == 0 && (value = compStrings[elementId + "-" + j + "-" + target]) != null)
                                            buffer.writeS(value);
                                        else
                                            buffer.skip(2);
                                    }
                                }
                                buffer.pos = nextPos;
                            }
                            break;
                        }
                    case fgui.ObjectType.Label:
                        {
                            if (buffer.seek(curPos, 6) && buffer.readByte() == type) {
                                if ((value = compStrings[elementId]) != null)
                                    buffer.writeS(value);
                                else
                                    buffer.skip(2);
                                buffer.skip(2);
                                if (buffer.readBool())
                                    buffer.skip(4);
                                buffer.skip(4);
                                if (buffer.readBool() && (value = compStrings[elementId + "-prompt"]) != null)
                                    buffer.writeS(value);
                            }
                            break;
                        }
                    case fgui.ObjectType.Button:
                        {
                            if (buffer.seek(curPos, 6) && buffer.readByte() == type) {
                                if ((value = compStrings[elementId]) != null)
                                    buffer.writeS(value);
                                else
                                    buffer.skip(2);
                                if ((value = compStrings[elementId + "-0"]) != null)
                                    buffer.writeS(value);
                            }
                            break;
                        }
                    case fgui.ObjectType.ComboBox:
                        {
                            if (buffer.seek(curPos, 6) && buffer.readByte() == type) {
                                itemCount = buffer.getInt16();
                                for (j = 0; j < itemCount; j++) {
                                    nextPos = buffer.getInt16();
                                    nextPos += buffer.pos;
                                    if ((value = compStrings[elementId + "-" + j]) != null)
                                        buffer.writeS(value);
                                    buffer.pos = nextPos;
                                }
                                if ((value = compStrings[elementId]) != null)
                                    buffer.writeS(value);
                            }
                            break;
                        }
                }
                buffer.pos = curPos + dataLen;
            }
        }
        static findChildNode(xml, name) {
            var col = xml.childNodes;
            var length1 = col.length;
            if (length1 > 0) {
                for (var i1 = 0; i1 < length1; i1++) {
                    var cxml = col[i1];
                    if (cxml.nodeName == name) {
                        return cxml;
                    }
                }
            }
            return null;
        }
    }
    TranslationHelper.strings = null;
    fgui.TranslationHelper = TranslationHelper;
})(fgui || (fgui = {}));

(function (fgui) {
    class UIConfig {
        constructor() {
        }
    }
    UIConfig.defaultFont = "SimSun";
    UIConfig.modalLayerColor = "rgba(33,33,33,0.2)";
    UIConfig.buttonSoundVolumeScale = 1;
    UIConfig.defaultScrollStep = 25;
    UIConfig.defaultScrollDecelerationRate = 0.967;
    UIConfig.defaultScrollBarDisplay = fgui.ScrollBarDisplayType.Visible;
    UIConfig.defaultScrollTouchEffect = true;
    UIConfig.defaultScrollBounceEffect = true;
    UIConfig.defaultScrollSnappingThreshold = 0.1;
    UIConfig.defaultScrollPagingThreshold = 0.3;
    UIConfig.defaultComboBoxVisibleItemCount = 10;
    UIConfig.touchScrollSensitivity = 20;
    UIConfig.touchDragSensitivity = 10;
    UIConfig.clickDragSensitivity = 2;
    UIConfig.bringWindowToFrontOnClick = true;
    UIConfig.frameTimeForAsyncUIConstruction = 2;
    UIConfig.textureLinearSampling = true;
    UIConfig.packageFileExtension = "fui";
    fgui.UIConfig = UIConfig;
})(fgui || (fgui = {}));

(function (fgui) {
    class UIObjectFactory {
        static setExtension(url, type) {
            if (url == null)
                throw new Error("Invaild url: " + url);
            var pi = fgui.UIPackage.getItemByURL(url);
            if (pi != null)
                pi.extensionType = type;
            UIObjectFactory.packageItemExtensions[url] = type;
        }
        static setPackageItemExtension(url, type) {
            UIObjectFactory.setExtension(url, type);
        }
        static setLoaderExtension(type) {
            UIObjectFactory.loaderType = type;
        }
        static resolvePackageItemExtension(pi) {
            var extensionType = UIObjectFactory.packageItemExtensions["ui://" + pi.owner.id + pi.id];
            if (!extensionType)
                extensionType = UIObjectFactory.packageItemExtensions["ui://" + pi.owner.name + "/" + pi.name];
            if (extensionType)
                pi.extensionType = extensionType;
        }
        static newObject(pi) {
            if (pi.extensionType)
                return new pi.extensionType();
            else
                return UIObjectFactory.newObject2(pi.objectType);
        }
        static newObject2(type) {
            switch (type) {
                case fgui.ObjectType.Image:
                    return new fgui.GImage();
                case fgui.ObjectType.MovieClip:
                    return new fgui.GMovieClip();
                case fgui.ObjectType.Component:
                    return new fgui.GComponent();
                case fgui.ObjectType.Text:
                    return new fgui.GBasicTextField();
                case fgui.ObjectType.RichText:
                    return new fgui.GRichTextField();
                case fgui.ObjectType.InputText:
                    return new fgui.GTextInput();
                case fgui.ObjectType.Group:
                    return new fgui.GGroup();
                case fgui.ObjectType.List:
                    return new fgui.GList();
                case fgui.ObjectType.Graph:
                    return new fgui.GGraph();
                case fgui.ObjectType.Loader:
                    if (UIObjectFactory.loaderType)
                        return new UIObjectFactory.loaderType();
                    else
                        return new fgui.GLoader();
                case fgui.ObjectType.Button:
                    return new fgui.GButton();
                case fgui.ObjectType.Label:
                    return new fgui.GLabel();
                case fgui.ObjectType.ProgressBar:
                    return new fgui.GProgressBar();
                case fgui.ObjectType.Slider:
                    return new fgui.GSlider();
                case fgui.ObjectType.ScrollBar:
                    return new fgui.GScrollBar();
                case fgui.ObjectType.ComboBox:
                    return new fgui.GComboBox();
                case fgui.ObjectType.Tree:
                    return new fgui.GTree();
                default:
                    return null;
            }
        }
    }
    UIObjectFactory.packageItemExtensions = {};
    fgui.UIObjectFactory = UIObjectFactory;
})(fgui || (fgui = {}));

(function (fgui) {
    class UIPackage {
        constructor() {
            this._items = [];
            this._itemsById = {};
            this._itemsByName = {};
            this._sprites = {};
            this._dependencies = Array();
            this._branches = Array();
            this._branchIndex = -1;
        }
        static get branch() {
            return UIPackage._branch;
        }
        static set branch(value) {
            UIPackage._branch = value;
            for (var pkgId in UIPackage._instById) {
                var pkg = UIPackage._instById[pkgId];
                if (pkg._branches) {
                    pkg._branchIndex = pkg._branches.indexOf(value);
                }
            }
        }
        static getVar(key) {
            return UIPackage._vars[key];
        }
        static setVar(key, value) {
            UIPackage._vars[key] = value;
        }
        static getById(id) {
            return UIPackage._instById[id];
        }
        static getByName(name) {
            return UIPackage._instByName[name];
        }
        static addPackage(resKey, descData) {
            if (!descData) {
                descData = fgui.AssetProxy.inst.getRes(resKey + "." + fgui.UIConfig.packageFileExtension);
                if (!descData || descData.byteLength == 0)
                    throw new Error("namespace sunnyboxs not ready: " + resKey);
            }
            var buffer = new fgui.ByteBuffer(descData);
            var pkg = new UIPackage();
            pkg.loadPackage(buffer, resKey);
            UIPackage._instById[pkg.id] = pkg;
            UIPackage._instByName[pkg.name] = pkg;
            pkg._customId = resKey;
            return pkg;
        }
        static loadPackage(resKey, completeHandler) {
            let url = resKey + "." + fgui.UIConfig.packageFileExtension;
            var descCompleteHandler = Laya.Handler.create(this, function (asset) {
                let pkg = new UIPackage();
                pkg.loadPackage(new fgui.ByteBuffer(asset), resKey);
                let cnt = pkg._items.length;
                let urls = [];
                for (var i = 0; i < cnt; i++) {
                    var pi = pkg._items[i];
                    if (pi.type == fgui.PackageItemType.Atlas)
                        urls.push({ url: pi.file, type: Laya.Loader.IMAGE });
                    else if (pi.type == fgui.PackageItemType.Sound)
                        urls.push({ url: pi.file, type: Laya.Loader.SOUND });
                }
                if (urls.length > 0) {
                    fgui.AssetProxy.inst.load(urls, Laya.Handler.create(this, function () {
                        UIPackage._instById[pkg.id] = pkg;
                        UIPackage._instByName[pkg.name] = pkg;
                        completeHandler.run();
                    }));
                }
                else{
                    UIPackage._instById[pkg.id] = pkg;
                    UIPackage._instByName[pkg.name] = pkg;
                    completeHandler.run();
                }
                
            });
            fgui.AssetProxy.inst.load(url, descCompleteHandler, null, Laya.Loader.BUFFER);
        }
        static removePackage(packageIdOrName) {
            var pkg = UIPackage._instById[packageIdOrName];
            if (!pkg)
                pkg = UIPackage._instByName[packageIdOrName];
            if (!pkg)
                throw new Error("unknown package: " + packageIdOrName);
            pkg.dispose();
            delete UIPackage._instById[pkg.id];
            if (pkg._customId != null)
                delete UIPackage._instById[pkg._customId];
            delete UIPackage._instByName[pkg.name];
        }
        static createObject(pkgName, resName, userClass) {
            var pkg = UIPackage.getByName(pkgName);
            if (pkg)
                return pkg.createObject(resName, userClass);
            else
                return null;
        }
        static createObjectFromURL(url, userClass) {
            var pi = UIPackage.getItemByURL(url);
            if (pi)
                return pi.owner.internalCreateObject(pi, userClass);
            else
                return null;
        }
        static getItemURL(pkgName, resName) {
            var pkg = UIPackage.getByName(pkgName);
            if (!pkg)
                return null;
            var pi = pkg._itemsByName[resName];
            if (!pi)
                return null;
            return "ui://" + pkg.id + pi.id;
        }
        static getItemByURL(url) {
            var pos1 = url.indexOf("//");
            if (pos1 == -1)
                return null;
            var pos2 = url.indexOf("/", pos1 + 2);
            if (pos2 == -1) {
                if (url.length > 13) {
                    var pkgId = url.substr(5, 8);
                    var pkg = UIPackage.getById(pkgId);
                    if (pkg != null) {
                        var srcId = url.substr(13);
                        return pkg.getItemById(srcId);
                    }
                }
            }
            else {
                var pkgName = url.substr(pos1 + 2, pos2 - pos1 - 2);
                pkg = UIPackage.getByName(pkgName);
                if (pkg != null) {
                    var srcName = url.substr(pos2 + 1);
                    return pkg.getItemByName(srcName);
                }
            }
            return null;
        }
        static getItemAssetByURL(url) {
            var item = UIPackage.getItemByURL(url);
            if (item == null)
                return null;
            return item.owner.getItemAsset(item);
        }
        static normalizeURL(url) {
            if (url == null)
                return null;
            var pos1 = url.indexOf("//");
            if (pos1 == -1)
                return null;
            var pos2 = url.indexOf("/", pos1 + 2);
            if (pos2 == -1)
                return url;
            var pkgName = url.substr(pos1 + 2, pos2 - pos1 - 2);
            var srcName = url.substr(pos2 + 1);
            return UIPackage.getItemURL(pkgName, srcName);
        }
        static setStringsSource(source) {
            fgui.TranslationHelper.loadFromXML(source);
        }
        loadPackage(buffer, resKey) {
            if (buffer.getUint32() != 0x46475549)
                throw new Error("FairyGUI: old namespace sunnyboxs found in '" + resKey + "'");
            buffer.version = buffer.getInt32();
            var ver2 = buffer.version >= 2;
            var compressed = buffer.readBool();
            this._id = buffer.readUTFString();
            this._name = buffer.readUTFString();
            buffer.skip(20);
            if (compressed) {
                var buf = new Uint8Array(buffer.buffer, buffer.pos, buffer.length - buffer.pos);
                var inflater = new Zlib.RawInflate(buf);
                buf = inflater.decompress();
                buffer = new fgui.ByteBuffer(buf);
            }
            var indexTablePos = buffer.pos;
            var cnt;
            var i;
            var j;
            var nextPos;
            var str;
            var branchIncluded;
            buffer.seek(indexTablePos, 4);
            cnt = buffer.getInt32();
            var stringTable = [];
            for (i = 0; i < cnt; i++)
                stringTable[i] = buffer.readUTFString();
            buffer.stringTable = stringTable;
            buffer.seek(indexTablePos, 0);
            cnt = buffer.getInt16();
            for (i = 0; i < cnt; i++)
                this._dependencies.push({ id: buffer.readS(), name: buffer.readS() });
            if (ver2) {
                cnt = buffer.getInt16();
                if (cnt > 0) {
                    this._branches = buffer.readSArray(cnt);
                    if (UIPackage._branch)
                        this._branchIndex = this._branches.indexOf(UIPackage._branch);
                }
                branchIncluded = cnt > 0;
            }
            buffer.seek(indexTablePos, 1);
            var pi;
            resKey = resKey + "_";
            cnt = buffer.getUint16();
            for (i = 0; i < cnt; i++) {
                nextPos = buffer.getInt32();
                nextPos += buffer.pos;
                pi = new fgui.PackageItem();
                pi.owner = this;
                pi.type = buffer.readByte();
                pi.id = buffer.readS();
                pi.name = buffer.readS();
                buffer.readS();
                str = buffer.readS();
                if (str)
                    pi.file = str;
                buffer.readBool();
                pi.width = buffer.getInt32();
                pi.height = buffer.getInt32();
                switch (pi.type) {
                    case fgui.PackageItemType.Image:
                        {
                            pi.objectType = fgui.ObjectType.Image;
                            var scaleOption = buffer.readByte();
                            if (scaleOption == 1) {
                                pi.scale9Grid = new Laya.Rectangle();
                                pi.scale9Grid.x = buffer.getInt32();
                                pi.scale9Grid.y = buffer.getInt32();
                                pi.scale9Grid.width = buffer.getInt32();
                                pi.scale9Grid.height = buffer.getInt32();
                                pi.tileGridIndice = buffer.getInt32();
                            }
                            else if (scaleOption == 2)
                                pi.scaleByTile = true;
                            pi.smoothing = buffer.readBool();
                            break;
                        }
                    case fgui.PackageItemType.MovieClip:
                        {
                            pi.smoothing = buffer.readBool();
                            pi.objectType = fgui.ObjectType.MovieClip;
                            pi.rawData = buffer.readBuffer();
                            break;
                        }
                    case fgui.PackageItemType.Font:
                        {
                            pi.rawData = buffer.readBuffer();
                            break;
                        }
                    case fgui.PackageItemType.Component:
                        {
                            var extension = buffer.readByte();
                            if (extension > 0)
                                pi.objectType = extension;
                            else
                                pi.objectType = fgui.ObjectType.Component;
                            pi.rawData = buffer.readBuffer();
                            fgui.UIObjectFactory.resolvePackageItemExtension(pi);
                            break;
                        }
                    case fgui.PackageItemType.Atlas:
                    case fgui.PackageItemType.Sound:
                    case fgui.PackageItemType.Misc:
                        {
                            pi.file = resKey + pi.file;
                            break;
                        }
                }
                if (ver2) {
                    str = buffer.readS();
                    if (str)
                        pi.name = str + "/" + pi.name;
                    var branchCnt = buffer.getUint8();
                    if (branchCnt > 0) {
                        if (branchIncluded)
                            pi.branches = buffer.readSArray(branchCnt);
                        else
                            this._itemsById[buffer.readS()] = pi;
                    }
                    var highResCnt = buffer.getUint8();
                    if (highResCnt > 0)
                        pi.highResolution = buffer.readSArray(highResCnt);
                }
                this._items.push(pi);
                this._itemsById[pi.id] = pi;
                if (pi.name != null)
                    this._itemsByName[pi.name] = pi;
                buffer.pos = nextPos;
            }
            buffer.seek(indexTablePos, 2);
            cnt = buffer.getUint16();
            for (i = 0; i < cnt; i++) {
                nextPos = buffer.getUint16();
                nextPos += buffer.pos;
                var itemId = buffer.readS();
                pi = this._itemsById[buffer.readS()];
                var sprite = new AtlasSprite();
                sprite.atlas = pi;
                sprite.rect.x = buffer.getInt32();
                sprite.rect.y = buffer.getInt32();
                sprite.rect.width = buffer.getInt32();
                sprite.rect.height = buffer.getInt32();
                sprite.rotated = buffer.readBool();
                if (ver2 && buffer.readBool()) {
                    sprite.offset.x = buffer.getInt32();
                    sprite.offset.y = buffer.getInt32();
                    sprite.originalSize.x = buffer.getInt32();
                    sprite.originalSize.y = buffer.getInt32();
                }
                else {
                    sprite.originalSize.x = sprite.rect.width;
                    sprite.originalSize.y = sprite.rect.height;
                }
                this._sprites[itemId] = sprite;
                buffer.pos = nextPos;
            }
            if (buffer.seek(indexTablePos, 3)) {
                cnt = buffer.getUint16();
                for (i = 0; i < cnt; i++) {
                    nextPos = buffer.getInt32();
                    nextPos += buffer.pos;
                    pi = this._itemsById[buffer.readS()];
                    if (pi && pi.type == fgui.PackageItemType.Image) {
                        pi.pixelHitTestData = new fgui.PixelHitTestData();
                        pi.pixelHitTestData.load(buffer);
                    }
                    buffer.pos = nextPos;
                }
            }
        }
        loadAllAssets() {
            var cnt = this._items.length;
            for (var i = 0; i < cnt; i++) {
                var pi = this._items[i];
                this.getItemAsset(pi);
            }
        }
        unloadAssets() {
            var cnt = this._items.length;
            for (var i = 0; i < cnt; i++) {
                var pi = this._items[i];
                if (pi.type == fgui.PackageItemType.Atlas) {
                    if (pi.texture != null)
                        Laya.loader.clearTextureRes(pi.texture.url);
                }
            }
        }
        dispose() {
            var cnt = this._items.length;
            for (var i = 0; i < cnt; i++) {
                var pi = this._items[i];
                if (pi.type == fgui.PackageItemType.Atlas) {
                    if (pi.texture != null) {
                        pi.texture.destroy();
                        pi.texture = null;
                    }
                }
                else if (pi.type == fgui.PackageItemType.Sound) {
                    Laya.SoundManager.destroySound(pi.file);
                }
            }
        }
        get id() {
            return this._id;
        }
        get name() {
            return this._name;
        }
        get customId() {
            return this._customId;
        }
        set customId(value) {
            if (this._customId != null)
                delete UIPackage._instById[this._customId];
            this._customId = value;
            if (this._customId != null)
                UIPackage._instById[this._customId] = this;
        }
        createObject(resName, userClass) {
            var pi = this._itemsByName[resName];
            if (pi)
                return this.internalCreateObject(pi, userClass);
            else
                return null;
        }
        internalCreateObject(item, userClass) {
            var g;
            if (item.type == fgui.PackageItemType.Component) {
                if (userClass)
                    g = new userClass();
                else
                    g = fgui.UIObjectFactory.newObject(item);
            }
            else
                g = fgui.UIObjectFactory.newObject(item);
            if (g == null)
                return null;
            UIPackage._constructing++;
            g.packageItem = item;
            g.constructFromResource();
            UIPackage._constructing--;
            return g;
        }
        getItemById(itemId) {
            return this._itemsById[itemId];
        }
        getItemByName(resName) {
            return this._itemsByName[resName];
        }
        getItemAssetByName(resName) {
            var pi = this._itemsByName[resName];
            if (pi == null) {
                throw "Resource not found -" + resName;
            }
            return this.getItemAsset(pi);
        }
        getItemAsset(item) {
            switch (item.type) {
                case fgui.PackageItemType.Image:
                    if (!item.decoded) {
                        item.decoded = true;
                        var sprite = this._sprites[item.id];
                        if (sprite != null) {
                            var atlasTexture = (this.getItemAsset(sprite.atlas));
                            item.texture = Laya.Texture.create(atlasTexture, sprite.rect.x, sprite.rect.y, sprite.rect.width, sprite.rect.height, sprite.offset.x, sprite.offset.y, sprite.originalSize.x, sprite.originalSize.y);
                        }
                        else
                            item.texture = null;
                    }
                    return item.texture;
                case fgui.PackageItemType.Atlas:
                    if (!item.decoded) {
                        item.decoded = true;
                        item.texture = fgui.AssetProxy.inst.getRes(item.file);
                    }
                    return item.texture;
                case fgui.PackageItemType.Font:
                    if (!item.decoded) {
                        item.decoded = true;
                        this.loadFont(item);
                    }
                    return item.bitmapFont;
                case fgui.PackageItemType.MovieClip:
                    if (!item.decoded) {
                        item.decoded = true;
                        this.loadMovieClip(item);
                    }
                    return item.frames;
                case fgui.PackageItemType.Component:
                    return item.rawData;
                case fgui.PackageItemType.Misc:
                    if (item.file)
                        return fgui.AssetProxy.inst.getRes(item.file);
                    else
                        return null;
                default:
                    return null;
            }
        }
        loadMovieClip(item) {
            var buffer = item.rawData;
            buffer.seek(0, 0);
            item.interval = buffer.getInt32();
            item.swing = buffer.readBool();
            item.repeatDelay = buffer.getInt32();
            buffer.seek(0, 1);
            var frameCount = buffer.getInt16();
            item.frames = [];
            var spriteId;
            var frame;
            var sprite;
            var fx;
            var fy;
            for (var i = 0; i < frameCount; i++) {
                var nextPos = buffer.getInt16();
                nextPos += buffer.pos;
                frame = new fgui.Frame();
                fx = buffer.getInt32();
                fy = buffer.getInt32();
                buffer.getInt32();
                buffer.getInt32();
                frame.addDelay = buffer.getInt32();
                spriteId = buffer.readS();
                if (spriteId != null && (sprite = this._sprites[spriteId]) != null) {
                    var atlasTexture = (this.getItemAsset(sprite.atlas));
                    frame.texture = Laya.Texture.create(atlasTexture, sprite.rect.x, sprite.rect.y, sprite.rect.width, sprite.rect.height, fx, fy, item.width, item.height);
                }
                item.frames[i] = frame;
                buffer.pos = nextPos;
            }
        }
        loadFont(item) {
            var font = new fgui.BitmapFont();
            item.bitmapFont = font;
            var buffer = item.rawData;
            buffer.seek(0, 0);
            font.ttf = buffer.readBool();
            font.tint = buffer.readBool();
            font.resizable = buffer.readBool();
            buffer.readBool();
            font.size = buffer.getInt32();
            var xadvance = buffer.getInt32();
            var lineHeight = buffer.getInt32();
            var bgWidth;
            var bgHeight;
            var mainTexture = null;
            var mainSprite = this._sprites[item.id];
            if (mainSprite != null)
                mainTexture = (this.getItemAsset(mainSprite.atlas));
            buffer.seek(0, 1);
            var bg = null;
            var cnt = buffer.getInt32();
            for (var i = 0; i < cnt; i++) {
                var nextPos = buffer.getInt16();
                nextPos += buffer.pos;
                bg = new fgui.BMGlyph();
                var ch = buffer.readChar();
                font.glyphs[ch] = bg;
                var img = buffer.readS();
                var bx = buffer.getInt32();
                var by = buffer.getInt32();
                bg.x = buffer.getInt32();
                bg.y = buffer.getInt32();
                bgWidth = buffer.getInt32();
                bgHeight = buffer.getInt32();
                bg.advance = buffer.getInt32();
                bg.channel = buffer.readByte();
                if (bg.channel == 1)
                    bg.channel = 3;
                else if (bg.channel == 2)
                    bg.channel = 2;
                else if (bg.channel == 3)
                    bg.channel = 1;
                if (font.ttf) {
                    bg.texture = Laya.Texture.create(mainTexture, bx + mainSprite.rect.x, by + mainSprite.rect.y, bgWidth, bgHeight);
                    bg.lineHeight = lineHeight;
                }
                else {
                    var charImg = this._itemsById[img];
                    if (charImg) {
                        charImg = charImg.getBranch();
                        bgWidth = charImg.width;
                        bgHeight = charImg.height;
                        charImg = charImg.getHighResolution();
                        this.getItemAsset(charImg);
                        bg.texture = charImg.texture;
                    }
                    if (bg.advance == 0) {
                        if (xadvance == 0)
                            bg.advance = bg.x + bgWidth;
                        else
                            bg.advance = xadvance;
                    }
                    bg.lineHeight = bg.y < 0 ? bgHeight : (bg.y + bgHeight);
                    if (bg.lineHeight < font.size)
                        bg.lineHeight = font.size;
                }
                bg.xMax = bg.x + bgWidth;
                bg.yMax = bg.y + bgHeight;
                buffer.pos = nextPos;
            }
        }
    }
    UIPackage._constructing = 0;
    UIPackage._instById = {};
    UIPackage._instByName = {};
    UIPackage._branch = "";
    UIPackage._vars = {};
    fgui.UIPackage = UIPackage;
    class AtlasSprite {
        constructor() {
            this.rect = new Laya.Rectangle();
            this.offset = new Laya.Point();
            this.originalSize = new Laya.Point();
        }
    }
})(fgui || (fgui = {}));

(function (fgui) {
    class Window extends fgui.GComponent {
        constructor() {
            super();
            this._requestingCmd = 0;
            this.focusable = true;
            this._uiSources = [];
            this.bringToFontOnClick = fgui.UIConfig.bringWindowToFrontOnClick;
            this.displayObject.on(Laya.Event.DISPLAY, this, this.__onShown);
            this.displayObject.on(Laya.Event.UNDISPLAY, this, this.__onHidden);
            this.displayObject.on(Laya.Event.MOUSE_DOWN, this, this.__mouseDown);
        }
        addUISource(source) {
            this._uiSources.push(source);
        }
        set contentPane(val) {
            if (this._contentPane != val) {
                if (this._contentPane != null)
                    this.removeChild(this._contentPane);
                this._contentPane = val;
                if (this._contentPane != null) {
                    this.addChild(this._contentPane);
                    this.setSize(this._contentPane.width, this._contentPane.height);
                    this._contentPane.addRelation(this, fgui.RelationType.Size);
                    this._frame = (this._contentPane.getChild("frame"));
                    if (this._frame != null) {
                        this.closeButton = this._frame.getChild("closeButton");
                        this.dragArea = this._frame.getChild("dragArea");
                        this.contentArea = this._frame.getChild("contentArea");
                    }
                }
            }
        }
        get contentPane() {
            return this._contentPane;
        }
        get frame() {
            return this._frame;
        }
        get closeButton() {
            return this._closeButton;
        }
        set closeButton(value) {
            if (this._closeButton != null)
                this._closeButton.offClick(this, this.closeEventHandler);
            this._closeButton = value;
            if (this._closeButton != null)
                this._closeButton.onClick(this, this.closeEventHandler);
        }
        get dragArea() {
            return this._dragArea;
        }
        set dragArea(value) {
            if (this._dragArea != value) {
                if (this._dragArea != null) {
                    this._dragArea.draggable = false;
                    this._dragArea.off(fgui.Events.DRAG_START, this, this.__dragStart);
                }
                this._dragArea = value;
                if (this._dragArea != null) {
                    if (this._dragArea instanceof fgui.GGraph)
                        this._dragArea.asGraph.drawRect(0, null, null);
                    this._dragArea.draggable = true;
                    this._dragArea.on(fgui.Events.DRAG_START, this, this.__dragStart);
                }
            }
        }
        get contentArea() {
            return this._contentArea;
        }
        set contentArea(value) {
            this._contentArea = value;
        }
        show() {
            fgui.GRoot.inst.showWindow(this);
        }
        showOn(root) {
            root.showWindow(this);
        }
        hide() {
            if (this.isShowing)
                this.doHideAnimation();
        }
        hideImmediately() {
            var r = (this.parent instanceof fgui.GRoot) ? this.parent : null;
            if (!r)
                r = fgui.GRoot.inst;
            r.hideWindowImmediately(this);
        }
        centerOn(r, restraint = false) {
            this.setXY(Math.round((r.width - this.width) / 2), Math.round((r.height - this.height) / 2));
            if (restraint) {
                this.addRelation(r, fgui.RelationType.Center_Center);
                this.addRelation(r, fgui.RelationType.Middle_Middle);
            }
        }
        toggleStatus() {
            if (this.isTop)
                this.hide();
            else
                this.show();
        }
        get isShowing() {
            return this.parent != null;
        }
        get isTop() {
            return this.parent != null && this.parent.getChildIndex(this) == this.parent.numChildren - 1;
        }
        get modal() {
            return this._modal;
        }
        set modal(val) {
            this._modal = val;
        }
        bringToFront() {
            this.root.bringToFront(this);
        }
        showModalWait(requestingCmd = 0) {
            if (requestingCmd != 0)
                this._requestingCmd = requestingCmd;
            if (fgui.UIConfig.windowModalWaiting) {
                if (!this._modalWaitPane)
                    this._modalWaitPane = fgui.UIPackage.createObjectFromURL(fgui.UIConfig.windowModalWaiting);
                this.layoutModalWaitPane();
                this.addChild(this._modalWaitPane);
            }
        }
        layoutModalWaitPane() {
            if (this._contentArea != null) {
                var pt = this._frame.localToGlobal();
                pt = this.globalToLocal(pt.x, pt.y, pt);
                this._modalWaitPane.setXY(pt.x + this._contentArea.x, pt.y + this._contentArea.y);
                this._modalWaitPane.setSize(this._contentArea.width, this._contentArea.height);
            }
            else
                this._modalWaitPane.setSize(this.width, this.height);
        }
        closeModalWait(requestingCmd = 0) {
            if (requestingCmd != 0) {
                if (this._requestingCmd != requestingCmd)
                    return false;
            }
            this._requestingCmd = 0;
            if (this._modalWaitPane && this._modalWaitPane.parent != null)
                this.removeChild(this._modalWaitPane);
            return true;
        }
        get modalWaiting() {
            return this._modalWaitPane && this._modalWaitPane.parent != null;
        }
        init() {
            if (this._inited || this._loading)
                return;
            if (this._uiSources.length > 0) {
                this._loading = false;
                var cnt = this._uiSources.length;
                for (var i = 0; i < cnt; i++) {
                    var lib = this._uiSources[i];
                    if (!lib.loaded) {
                        lib.load(this.__uiLoadComplete, this);
                        this._loading = true;
                    }
                }
                if (!this._loading)
                    this._init();
            }
            else
                this._init();
        }
        onInit() {
        }
        onShown() {
        }
        onHide() {
        }
        doShowAnimation() {
            this.onShown();
        }
        doHideAnimation() {
            this.hideImmediately();
        }
        __uiLoadComplete() {
            var cnt = this._uiSources.length;
            for (var i = 0; i < cnt; i++) {
                var lib = this._uiSources[i];
                if (!lib.loaded)
                    return;
            }
            this._loading = false;
            this._init();
        }
        _init() {
            this._inited = true;
            this.onInit();
            if (this.isShowing)
                this.doShowAnimation();
        }
        dispose() {
            if (this.parent != null)
                this.hideImmediately();
            super.dispose();
        }
        closeEventHandler() {
            this.hide();
        }
        __onShown() {
            if (!this._inited)
                this.init();
            else
                this.doShowAnimation();
        }
        __onHidden() {
            this.closeModalWait();
            this.onHide();
        }
        __mouseDown() {
            if (this.isShowing && this.bringToFontOnClick)
                this.bringToFront();
        }
        __dragStart(evt) {
            fgui.GObject.cast(evt.currentTarget).stopDrag();
            this.startDrag();
        }
    }
    fgui.Window = Window;
})(fgui || (fgui = {}));

(function (fgui) {
    class ControllerAction {
        constructor() {
        }
        static createAction(type) {
            switch (type) {
                case 0:
                    return new fgui.PlayTransitionAction();
                case 1:
                    return new fgui.ChangePageAction();
            }
            return null;
        }
        run(controller, prevPage, curPage) {
            if ((this.fromPage == null || this.fromPage.length == 0 || this.fromPage.indexOf(prevPage) != -1)
                && (this.toPage == null || this.toPage.length == 0 || this.toPage.indexOf(curPage) != -1))
                this.enter(controller);
            else
                this.leave(controller);
        }
        enter(controller) {
        }
        leave(controller) {
        }
        setup(buffer) {
            var cnt;
            var i;
            cnt = buffer.getInt16();
            this.fromPage = [];
            for (i = 0; i < cnt; i++)
                this.fromPage[i] = buffer.readS();
            cnt = buffer.getInt16();
            this.toPage = [];
            for (i = 0; i < cnt; i++)
                this.toPage[i] = buffer.readS();
        }
    }
    fgui.ControllerAction = ControllerAction;
})(fgui || (fgui = {}));

(function (fgui) {
    class ChangePageAction extends fgui.ControllerAction {
        constructor() {
            super();
        }
        enter(controller) {
            if (!this.controllerName)
                return;
            var gcom;
            if (this.objectId)
                gcom = controller.parent.getChildById(this.objectId);
            else
                gcom = controller.parent;
            if (gcom) {
                var cc = gcom.getController(this.controllerName);
                if (cc && cc != controller && !cc.changing) {
                    if (this.targetPage == "~1") {
                        if (controller.selectedIndex < cc.pageCount)
                            cc.selectedIndex = controller.selectedIndex;
                    }
                    else if (this.targetPage == "~2")
                        cc.selectedPage = controller.selectedPage;
                    else
                        cc.selectedPageId = this.targetPage;
                }
            }
        }
        setup(buffer) {
            super.setup(buffer);
            this.objectId = buffer.readS();
            this.controllerName = buffer.readS();
            this.targetPage = buffer.readS();
        }
    }
    fgui.ChangePageAction = ChangePageAction;
})(fgui || (fgui = {}));

(function (fgui) {
    class PlayTransitionAction extends fgui.ControllerAction {
        constructor() {
            super();
            this.playTimes = 1;
            this.delay = 0;
            this.stopOnExit = false;
        }
        enter(controller) {
            var trans = controller.parent.getTransition(this.transitionName);
            if (trans) {
                if (this._currentTransition && this._currentTransition.playing)
                    trans.changePlayTimes(this.playTimes);
                else
                    trans.play(null, this.playTimes, this.delay);
                this._currentTransition = trans;
            }
        }
        leave(controller) {
            if (this.stopOnExit && this._currentTransition) {
                this._currentTransition.stop();
                this._currentTransition = null;
            }
        }
        setup(buffer) {
            super.setup(buffer);
            this.transitionName = buffer.readS();
            this.playTimes = buffer.getInt32();
            this.delay = buffer.getFloat32();
            this.stopOnExit = buffer.readBool();
        }
    }
    fgui.PlayTransitionAction = PlayTransitionAction;
})(fgui || (fgui = {}));

(function (fgui) {
    class BitmapFont {
        constructor() {
            this.size = 0;
            this.glyphs = {};
        }
    }
    fgui.BitmapFont = BitmapFont;
    class BMGlyph {
        constructor() {
            this.x = 0;
            this.y = 0;
            this.xMax = 0;
            this.yMax = 0;
            this.advance = 0;
            this.lineHeight = 0;
            this.channel = 0;
        }
    }
    fgui.BMGlyph = BMGlyph;
})(fgui || (fgui = {}));

(function (fgui) {
    class FillUtils {
        static fill(w, h, method, origin, clockwise, amount) {
            if (amount <= 0)
                return null;
            else if (amount >= 0.9999)
                return [0, 0, w, 0, w, h, 0, h];
            var points;
            switch (method) {
                case fgui.FillMethod.Horizontal:
                    points = FillUtils.fillHorizontal(w, h, origin, amount);
                    break;
                case fgui.FillMethod.Vertical:
                    points = FillUtils.fillVertical(w, h, origin, amount);
                    break;
                case fgui.FillMethod.Radial90:
                    points = FillUtils.fillRadial90(w, h, origin, clockwise, amount);
                    break;
                case fgui.FillMethod.Radial180:
                    points = FillUtils.fillRadial180(w, h, origin, clockwise, amount);
                    break;
                case fgui.FillMethod.Radial360:
                    points = FillUtils.fillRadial360(w, h, origin, clockwise, amount);
                    break;
            }
            return points;
        }
        static fillHorizontal(w, h, origin, amount) {
            var w2 = w * amount;
            if (origin == fgui.FillOrigin.Left || origin == fgui.FillOrigin.Top)
                return [0, 0, w2, 0, w2, h, 0, h];
            else
                return [w, 0, w, h, w - w2, h, w - w2, 0];
        }
        static fillVertical(w, h, origin, amount) {
            var h2 = h * amount;
            if (origin == fgui.FillOrigin.Left || origin == fgui.FillOrigin.Top)
                return [0, 0, 0, h2, w, h2, w, 0];
            else
                return [0, h, w, h, w, h - h2, 0, h - h2];
        }
        static fillRadial90(w, h, origin, clockwise, amount) {
            if (clockwise && (origin == fgui.FillOrigin.TopRight || origin == fgui.FillOrigin.BottomLeft)
                || !clockwise && (origin == fgui.FillOrigin.TopLeft || origin == fgui.FillOrigin.BottomRight)) {
                amount = 1 - amount;
            }
            var v, v2, h2;
            v = Math.tan(Math.PI / 2 * amount);
            h2 = w * v;
            v2 = (h2 - h) / h2;
            var points;
            switch (origin) {
                case fgui.FillOrigin.TopLeft:
                    if (clockwise) {
                        if (h2 <= h)
                            points = [0, 0, w, h2, w, 0];
                        else
                            points = [0, 0, w * (1 - v2), h, w, h, w, 0];
                    }
                    else {
                        if (h2 <= h)
                            points = [0, 0, w, h2, w, h, 0, h];
                        else
                            points = [0, 0, w * (1 - v2), h, 0, h];
                    }
                    break;
                case fgui.FillOrigin.TopRight:
                    if (clockwise) {
                        if (h2 <= h)
                            points = [w, 0, 0, h2, 0, h, w, h];
                        else
                            points = [w, 0, w * v2, h, w, h];
                    }
                    else {
                        if (h2 <= h)
                            points = [w, 0, 0, h2, 0, 0];
                        else
                            points = [w, 0, w * v2, h, 0, h, 0, 0];
                    }
                    break;
                case fgui.FillOrigin.BottomLeft:
                    if (clockwise) {
                        if (h2 <= h)
                            points = [0, h, w, h - h2, w, 0, 0, 0];
                        else
                            points = [0, h, w * (1 - v2), 0, 0, 0];
                    }
                    else {
                        if (h2 <= h)
                            points = [0, h, w, h - h2, w, h];
                        else
                            points = [0, h, w * (1 - v2), 0, w, 0, w, h];
                    }
                    break;
                case fgui.FillOrigin.BottomRight:
                    if (clockwise) {
                        if (h2 <= h)
                            points = [w, h, 0, h - h2, 0, h];
                        else
                            points = [w, h, w * v2, 0, 0, 0, 0, h];
                    }
                    else {
                        if (h2 <= h)
                            points = [w, h, 0, h - h2, 0, 0, w, 0];
                        else
                            points = [w, h, w * v2, 0, w, 0];
                    }
                    break;
            }
            return points;
        }
        static movePoints(points, offsetX, offsetY) {
            var cnt = points.length;
            for (var i = 0; i < cnt; i += 2) {
                points[i] += offsetX;
                points[i + 1] += offsetY;
            }
        }
        static fillRadial180(w, h, origin, clockwise, amount) {
            var points;
            switch (origin) {
                case fgui.FillOrigin.Top:
                    if (amount <= 0.5) {
                        amount = amount / 0.5;
                        points = FillUtils.fillRadial90(w / 2, h, clockwise ? fgui.FillOrigin.TopLeft : fgui.FillOrigin.TopRight, clockwise, amount);
                        if (clockwise)
                            FillUtils.movePoints(points, w / 2, 0);
                    }
                    else {
                        amount = (amount - 0.5) / 0.5;
                        points = FillUtils.fillRadial90(w / 2, h, clockwise ? fgui.FillOrigin.TopRight : fgui.FillOrigin.TopLeft, clockwise, amount);
                        if (clockwise)
                            points.push(w, h, w, 0);
                        else {
                            FillUtils.movePoints(points, w / 2, 0);
                            points.push(0, h, 0, 0);
                        }
                    }
                    break;
                case fgui.FillOrigin.Bottom:
                    if (amount <= 0.5) {
                        amount = amount / 0.5;
                        points = FillUtils.fillRadial90(w / 2, h, clockwise ? fgui.FillOrigin.BottomRight : fgui.FillOrigin.BottomLeft, clockwise, amount);
                        if (!clockwise)
                            FillUtils.movePoints(points, w / 2, 0);
                    }
                    else {
                        amount = (amount - 0.5) / 0.5;
                        points = FillUtils.fillRadial90(w / 2, h, clockwise ? fgui.FillOrigin.BottomLeft : fgui.FillOrigin.BottomRight, clockwise, amount);
                        if (clockwise) {
                            FillUtils.movePoints(points, w / 2, 0);
                            points.push(0, 0, 0, h);
                        }
                        else
                            points.push(w, 0, w, h);
                    }
                    break;
                case fgui.FillOrigin.Left:
                    if (amount <= 0.5) {
                        amount = amount / 0.5;
                        points = FillUtils.fillRadial90(w, h / 2, clockwise ? fgui.FillOrigin.BottomLeft : fgui.FillOrigin.TopLeft, clockwise, amount);
                        if (!clockwise)
                            FillUtils.movePoints(points, 0, h / 2);
                    }
                    else {
                        amount = (amount - 0.5) / 0.5;
                        points = FillUtils.fillRadial90(w, h / 2, clockwise ? fgui.FillOrigin.TopLeft : fgui.FillOrigin.BottomLeft, clockwise, amount);
                        if (clockwise) {
                            FillUtils.movePoints(points, 0, h / 2);
                            points.push(w, 0, 0, 0);
                        }
                        else
                            points.push(w, h, 0, h);
                    }
                    break;
                case fgui.FillOrigin.Right:
                    if (amount <= 0.5) {
                        amount = amount / 0.5;
                        points = FillUtils.fillRadial90(w, h / 2, clockwise ? fgui.FillOrigin.TopRight : fgui.FillOrigin.BottomRight, clockwise, amount);
                        if (clockwise)
                            FillUtils.movePoints(points, 0, h / 2);
                    }
                    else {
                        amount = (amount - 0.5) / 0.5;
                        points = FillUtils.fillRadial90(w, h / 2, clockwise ? fgui.FillOrigin.BottomRight : fgui.FillOrigin.TopRight, clockwise, amount);
                        if (clockwise)
                            points.push(0, h, w, h);
                        else {
                            FillUtils.movePoints(points, 0, h / 2);
                            points.push(0, 0, w, 0);
                        }
                    }
                    break;
            }
            return points;
        }
        static fillRadial360(w, h, origin, clockwise, amount) {
            var points;
            switch (origin) {
                case fgui.FillOrigin.Top:
                    if (amount <= 0.5) {
                        amount = amount / 0.5;
                        points = FillUtils.fillRadial180(w / 2, h, clockwise ? fgui.FillOrigin.Left : fgui.FillOrigin.Right, clockwise, amount);
                        if (clockwise)
                            FillUtils.movePoints(points, w / 2, 0);
                    }
                    else {
                        amount = (amount - 0.5) / 0.5;
                        points = FillUtils.fillRadial180(w / 2, h, clockwise ? fgui.FillOrigin.Right : fgui.FillOrigin.Left, clockwise, amount);
                        if (clockwise)
                            points.push(w, h, w, 0, w / 2, 0);
                        else {
                            FillUtils.movePoints(points, w / 2, 0);
                            points.push(0, h, 0, 0, w / 2, 0);
                        }
                    }
                    break;
                case fgui.FillOrigin.Bottom:
                    if (amount <= 0.5) {
                        amount = amount / 0.5;
                        points = FillUtils.fillRadial180(w / 2, h, clockwise ? fgui.FillOrigin.Right : fgui.FillOrigin.Left, clockwise, amount);
                        if (!clockwise)
                            FillUtils.movePoints(points, w / 2, 0);
                    }
                    else {
                        amount = (amount - 0.5) / 0.5;
                        points = FillUtils.fillRadial180(w / 2, h, clockwise ? fgui.FillOrigin.Left : fgui.FillOrigin.Right, clockwise, amount);
                        if (clockwise) {
                            FillUtils.movePoints(points, w / 2, 0);
                            points.push(0, 0, 0, h, w / 2, h);
                        }
                        else
                            points.push(w, 0, w, h, w / 2, h);
                    }
                    break;
                case fgui.FillOrigin.Left:
                    if (amount <= 0.5) {
                        amount = amount / 0.5;
                        points = FillUtils.fillRadial180(w, h / 2, clockwise ? fgui.FillOrigin.Bottom : fgui.FillOrigin.Top, clockwise, amount);
                        if (!clockwise)
                            FillUtils.movePoints(points, 0, h / 2);
                    }
                    else {
                        amount = (amount - 0.5) / 0.5;
                        points = FillUtils.fillRadial180(w, h / 2, clockwise ? fgui.FillOrigin.Top : fgui.FillOrigin.Bottom, clockwise, amount);
                        if (clockwise) {
                            FillUtils.movePoints(points, 0, h / 2);
                            points.push(w, 0, 0, 0, 0, h / 2);
                        }
                        else
                            points.push(w, h, 0, h, 0, h / 2);
                    }
                    break;
                case fgui.FillOrigin.Right:
                    if (amount <= 0.5) {
                        amount = amount / 0.5;
                        points = FillUtils.fillRadial180(w, h / 2, clockwise ? fgui.FillOrigin.Top : fgui.FillOrigin.Bottom, clockwise, amount);
                        if (clockwise)
                            FillUtils.movePoints(points, 0, h / 2);
                    }
                    else {
                        amount = (amount - 0.5) / 0.5;
                        points = FillUtils.fillRadial180(w, h / 2, clockwise ? fgui.FillOrigin.Bottom : fgui.FillOrigin.Top, clockwise, amount);
                        if (clockwise)
                            points.push(0, h, w, h, w, h / 2);
                        else {
                            FillUtils.movePoints(points, 0, h / 2);
                            points.push(0, 0, w, 0, w, h / 2);
                        }
                    }
                    break;
            }
            return points;
        }
    }
    fgui.FillUtils = FillUtils;
})(fgui || (fgui = {}));

(function (fgui) {
    class Image extends Laya.Sprite {
        constructor() {
            super();
            this._scaleByTile = false;
            this._scale9Grid = null;
            this._tileGridIndice = 0;
            this._needRebuild = 0;
            this._fillMethod = 0;
            this._fillOrigin = 0;
            this._fillAmount = 0;
            this._fillClockwise = false;
            this._mask = null;
            this.mouseEnabled = false;
            this._color = "#FFFFFF";
        }
        set width(value) {
            if (this["_width"] !== value) {
                super.set_width(value);
                this.markChanged(1);
            }
        }
        set height(value) {
            if (this["_height"] !== value) {
                super.set_height(value);
                this.markChanged(1);
            }
        }
        get texture() {
            return this._source;
        }
        set texture(value) {
            if (this._source != value) {
                this._source = value;
                if (this["_width"] == 0) {
                    if (this._source)
                        this.size(this._source.width, this._source.height);
                    else
                        this.size(0, 0);
                }
                this.repaint();
                this.markChanged(1);
            }
        }
        get scale9Grid() {
            return this._scale9Grid;
        }
        set scale9Grid(value) {
            this._scale9Grid = value;
            this._sizeGrid = null;
            this.markChanged(1);
        }
        get scaleByTile() {
            return this._scaleByTile;
        }
        set scaleByTile(value) {
            if (this._scaleByTile != value) {
                this._scaleByTile = value;
                this.markChanged(1);
            }
        }
        get tileGridIndice() {
            return this._tileGridIndice;
        }
        set tileGridIndice(value) {
            if (this._tileGridIndice != value) {
                this._tileGridIndice = value;
                this.markChanged(1);
            }
        }
        get fillMethod() {
            return this._fillMethod;
        }
        set fillMethod(value) {
            if (this._fillMethod != value) {
                this._fillMethod = value;
                if (this._fillMethod != 0) {
                    if (!this._mask) {
                        this._mask = new Laya.Sprite();
                        this._mask.mouseEnabled = false;
                    }
                    this.mask = this._mask;
                    this.markChanged(2);
                }
                else if (this.mask) {
                    this._mask.graphics.clear();
                    this.mask = null;
                }
            }
        }
        get fillOrigin() {
            return this._fillOrigin;
        }
        set fillOrigin(value) {
            if (this._fillOrigin != value) {
                this._fillOrigin = value;
                if (this._fillMethod != 0)
                    this.markChanged(2);
            }
        }
        get fillClockwise() {
            return this._fillClockwise;
        }
        set fillClockwise(value) {
            if (this._fillClockwise != value) {
                this._fillClockwise = value;
                if (this._fillMethod != 0)
                    this.markChanged(2);
            }
        }
        get fillAmount() {
            return this._fillAmount;
        }
        set fillAmount(value) {
            if (this._fillAmount != value) {
                this._fillAmount = value;
                if (this._fillMethod != 0)
                    this.markChanged(2);
            }
        }
        get color() {
            return this._color;
        }
        set color(value) {
            if (this._color != value) {
                this._color = value;
                fgui.ToolSet.setColorFilter(this, value);
            }
        }
        markChanged(flag) {
            if (!this._needRebuild) {
                this._needRebuild = flag;
                Laya.timer.callLater(this, this.rebuild);
            }
            else
                this._needRebuild |= flag;
        }
        rebuild() {
            if ((this._needRebuild & 1) != 0)
                this.doDraw();
            if ((this._needRebuild & 2) != 0 && this._fillMethod != 0)
                this.doFill();
            this._needRebuild = 0;
        }
        doDraw() {
            var w = this["_width"];
            var h = this["_height"];
            var g = this.graphics;
            var tex = this._source;
            g.clear();
            if (tex == null || w == 0 || h == 0) {
                return;
            }
            if (this._scaleByTile) {
                g.fillTexture(tex, 0, 0, w, h);
            }
            else if (this._scale9Grid != null) {
                if (!this._sizeGrid) {
                    var tw = tex.width;
                    var th = tex.height;
                    var left = this._scale9Grid.x;
                    var right = Math.max(tw - this._scale9Grid.right, 0);
                    var top = this._scale9Grid.y;
                    var bottom = Math.max(th - this._scale9Grid.bottom, 0);
                    this._sizeGrid = [top, right, bottom, left];
                }
                g.draw9Grid(tex, 0, 0, w, h, this._sizeGrid);
            }
            else {
                g.drawImage(tex, 0, 0, w, h);
            }
        }
        doFill() {
            var w = this["_width"];
            var h = this["_height"];
            var g = this._mask.graphics;
            g.clear();
            if (w == 0 || h == 0)
                return;
            var points = fgui.FillUtils.fill(w, h, this._fillMethod, this._fillOrigin, this._fillClockwise, this._fillAmount);
            if (points == null) {
                this.mask = null;
                this.mask = this._mask;
                return;
            }
            g.drawPoly(0, 0, points, "#FFFFFF");
        }
    }
    fgui.Image = Image;
})(fgui || (fgui = {}));

(function (fgui) {
    class MovieClip extends fgui.Image {
        constructor() {
            super();
            this.interval = 0;
            this.swing = false;
            this.repeatDelay = 0;
            this.timeScale = 1;
            this._playing = true;
            this._frameCount = 0;
            this._frame = 0;
            this._start = 0;
            this._end = 0;
            this._times = 0;
            this._endAt = 0;
            this._status = 0;
            this._endHandler = null;
            this._frameElapsed = 0;
            this._reversed = false;
            this._repeatedCount = 0;
            this.mouseEnabled = false;
            this.setPlaySettings();
            this.on(Laya.Event.DISPLAY, this, this.__addToStage);
            this.on(Laya.Event.UNDISPLAY, this, this.__removeFromStage);
        }
        get frames() {
            return this._frames;
        }
        set frames(value) {
            this._frames = value;
            this._scaleByTile = false;
            this._scale9Grid = null;
            if (this._frames != null) {
                this._frameCount = this._frames.length;
                if (this._end == -1 || this._end > this._frameCount - 1)
                    this._end = this._frameCount - 1;
                if (this._endAt == -1 || this._endAt > this._frameCount - 1)
                    this._endAt = this._frameCount - 1;
                if (this._frame < 0 || this._frame > this._frameCount - 1)
                    this._frame = this._frameCount - 1;
                this._frameElapsed = 0;
                this._repeatedCount = 0;
                this._reversed = false;
            }
            else
                this._frameCount = 0;
            this.drawFrame();
            this.checkTimer();
        }
        get frameCount() {
            return this._frameCount;
        }
        get frame() {
            return this._frame;
        }
        set frame(value) {
            if (this._frame != value) {
                if (this._frames != null && value >= this._frameCount)
                    value = this._frameCount - 1;
                this._frame = value;
                this._frameElapsed = 0;
                this.drawFrame();
            }
        }
        get playing() {
            return this._playing;
        }
        set playing(value) {
            if (this._playing != value) {
                this._playing = value;
                this.checkTimer();
            }
        }
        rewind() {
            this._frame = 0;
            this._frameElapsed = 0;
            this._reversed = false;
            this._repeatedCount = 0;
            this.drawFrame();
        }
        syncStatus(anotherMc) {
            this._frame = anotherMc._frame;
            this._frameElapsed = anotherMc._frameElapsed;
            this._reversed = anotherMc._reversed;
            this._repeatedCount = anotherMc._repeatedCount;
            this.drawFrame();
        }
        advance(timeInMiniseconds) {
            var beginFrame = this._frame;
            var beginReversed = this._reversed;
            var backupTime = timeInMiniseconds;
            while (true) {
                var tt = this.interval + this._frames[this._frame].addDelay;
                if (this._frame == 0 && this._repeatedCount > 0)
                    tt += this.repeatDelay;
                if (timeInMiniseconds < tt) {
                    this._frameElapsed = 0;
                    break;
                }
                timeInMiniseconds -= tt;
                if (this.swing) {
                    if (this._reversed) {
                        this._frame--;
                        if (this._frame <= 0) {
                            this._frame = 0;
                            this._repeatedCount++;
                            this._reversed = !this._reversed;
                        }
                    }
                    else {
                        this._frame++;
                        if (this._frame > this._frameCount - 1) {
                            this._frame = Math.max(0, this._frameCount - 2);
                            this._repeatedCount++;
                            this._reversed = !this._reversed;
                        }
                    }
                }
                else {
                    this._frame++;
                    if (this._frame > this._frameCount - 1) {
                        this._frame = 0;
                        this._repeatedCount++;
                    }
                }
                if (this._frame == beginFrame && this._reversed == beginReversed) {
                    var roundTime = backupTime - timeInMiniseconds;
                    timeInMiniseconds -= Math.floor(timeInMiniseconds / roundTime) * roundTime;
                }
            }
            this.drawFrame();
        }
        setPlaySettings(start = 0, end = -1, times = 0, endAt = -1, endHandler = null) {
            this._start = start;
            this._end = end;
            if (this._end == -1 || this._end > this._frameCount - 1)
                this._end = this._frameCount - 1;
            this._times = times;
            this._endAt = endAt;
            if (this._endAt == -1)
                this._endAt = this._end;
            this._status = 0;
            this._endHandler = endHandler;
            this.frame = start;
        }
        update() {
            if (!this._playing || this._frameCount == 0 || this._status == 3)
                return;
            var dt = Laya.timer.delta;
            if (dt > 100)
                dt = 100;
            if (this.timeScale != 1)
                dt *= this.timeScale;
            this._frameElapsed += dt;
            var tt = this.interval + this._frames[this._frame].addDelay;
            if (this._frame == 0 && this._repeatedCount > 0)
                tt += this.repeatDelay;
            if (this._frameElapsed < tt)
                return;
            this._frameElapsed -= tt;
            if (this._frameElapsed > this.interval)
                this._frameElapsed = this.interval;
            if (this.swing) {
                if (this._reversed) {
                    this._frame--;
                    if (this._frame <= 0) {
                        this._frame = 0;
                        this._repeatedCount++;
                        this._reversed = !this._reversed;
                    }
                }
                else {
                    this._frame++;
                    if (this._frame > this._frameCount - 1) {
                        this._frame = Math.max(0, this._frameCount - 2);
                        this._repeatedCount++;
                        this._reversed = !this._reversed;
                    }
                }
            }
            else {
                this._frame++;
                if (this._frame > this._frameCount - 1) {
                    this._frame = 0;
                    this._repeatedCount++;
                }
            }
            if (this._status == 1) {
                this._frame = this._start;
                this._frameElapsed = 0;
                this._status = 0;
            }
            else if (this._status == 2) {
                this._frame = this._endAt;
                this._frameElapsed = 0;
                this._status = 3;
                if (this._endHandler != null) {
                    var handler = this._endHandler;
                    this._endHandler = null;
                    handler.run();
                }
            }
            else {
                if (this._frame == this._end) {
                    if (this._times > 0) {
                        this._times--;
                        if (this._times == 0)
                            this._status = 2;
                        else
                            this._status = 1;
                    }
                    else if (this._start != 0)
                        this._status = 1;
                }
            }
            this.drawFrame();
        }
        drawFrame() {
            if (this._frameCount > 0 && this._frame < this._frames.length) {
                var frame = this._frames[this._frame];
                this.texture = frame.texture;
            }
            else
                this.texture = null;
            this.rebuild();
        }
        checkTimer() {
            if (this._playing && this._frameCount > 0 && this.stage != null)
                Laya.timer.frameLoop(1, this, this.update);
            else
                Laya.timer.clear(this, this.update);
        }
        __addToStage() {
            if (this._playing && this._frameCount > 0)
                Laya.timer.frameLoop(1, this, this.update);
        }
        __removeFromStage() {
            Laya.timer.clear(this, this.update);
        }
    }
    fgui.MovieClip = MovieClip;
    class Frame {
        constructor() {
            this.addDelay = 0;
        }
    }
    fgui.Frame = Frame;
})(fgui || (fgui = {}));

(function (fgui) {
    class GearBase {
        constructor(owner) {
            this._owner = owner;
        }
        static create(owner, index) {
            if (!GearBase.Classes)
                GearBase.Classes = [
                    fgui.GearDisplay, fgui.GearXY, fgui.GearSize, fgui.GearLook, fgui.GearColor,
                    fgui.GearAnimation, fgui.GearText, fgui.GearIcon, fgui.GearDisplay2, fgui.GearFontSize
                ];
            return new (GearBase.Classes[index])(owner);
        }
        dispose() {
            if (this._tweenConfig != null && this._tweenConfig._tweener != null) {
                this._tweenConfig._tweener.kill();
                this._tweenConfig._tweener = null;
            }
        }
        get controller() {
            return this._controller;
        }
        set controller(val) {
            if (val != this._controller) {
                this._controller = val;
                if (this._controller)
                    this.init();
            }
        }
        get tweenConfig() {
            if (this._tweenConfig == null)
                this._tweenConfig = new GearTweenConfig();
            return this._tweenConfig;
        }
        setup(buffer) {
            this._controller = this._owner.parent.getControllerAt(buffer.getInt16());
            this.init();
            var i;
            var page;
            var cnt = buffer.getInt16();
            if (this instanceof fgui.GearDisplay) {
                this.pages = buffer.readSArray(cnt);
            }
            else if (this instanceof fgui.GearDisplay2) {
                this.pages = buffer.readSArray(cnt);
            }
            else {
                for (i = 0; i < cnt; i++) {
                    page = buffer.readS();
                    if (page == null)
                        continue;
                    this.addStatus(page, buffer);
                }
                if (buffer.readBool())
                    this.addStatus(null, buffer);
            }
            if (buffer.readBool()) {
                this._tweenConfig = new GearTweenConfig();
                this._tweenConfig.easeType = buffer.readByte();
                this._tweenConfig.duration = buffer.getFloat32();
                this._tweenConfig.delay = buffer.getFloat32();
            }
            if (buffer.version >= 2) {
                if (this instanceof fgui.GearXY) {
                    if (buffer.readBool()) {
                        this.positionsInPercent = true;
                        for (i = 0; i < cnt; i++) {
                            page = buffer.readS();
                            if (page == null)
                                continue;
                            this.addExtStatus(page, buffer);
                        }
                        if (buffer.readBool())
                            this.addExtStatus(null, buffer);
                    }
                }
                else if (this instanceof fgui.GearDisplay2)
                    this.condition = buffer.readByte();
            }
        }
        updateFromRelations(dx, dy) {
        }
        addStatus(pageId, buffer) {
        }
        init() {
        }
        apply() {
        }
        updateState() {
        }
    }
    GearBase.disableAllTweenEffect = false;
    fgui.GearBase = GearBase;
    class GearTweenConfig {
        constructor() {
            this.tween = true;
            this.easeType = fgui.EaseType.QuadOut;
            this.duration = 0.3;
            this.delay = 0;
        }
    }
    fgui.GearTweenConfig = GearTweenConfig;
})(fgui || (fgui = {}));

(function (fgui) {
    class GearAnimation extends fgui.GearBase {
        constructor(owner) {
            super(owner);
        }
        init() {
            this._default = new GearAnimationValue(this._owner.getProp(fgui.ObjectPropID.Playing), this._owner.getProp(fgui.ObjectPropID.Frame));
            this._storage = {};
        }
        addStatus(pageId, buffer) {
            var gv;
            if (pageId == null)
                gv = this._default;
            else {
                gv = new GearAnimationValue();
                this._storage[pageId] = gv;
            }
            gv.playing = buffer.readBool();
            gv.frame = buffer.getInt32();
        }
        apply() {
            this._owner._gearLocked = true;
            var gv = this._storage[this._controller.selectedPageId];
            if (!gv)
                gv = this._default;
            this._owner.setProp(fgui.ObjectPropID.Playing, gv.playing);
            this._owner.setProp(fgui.ObjectPropID.Frame, gv.frame);
            this._owner._gearLocked = false;
        }
        updateState() {
            var gv = this._storage[this._controller.selectedPageId];
            if (!gv) {
                gv = new GearAnimationValue();
                this._storage[this._controller.selectedPageId] = gv;
            }
            gv.playing = this._owner.getProp(fgui.ObjectPropID.Playing);
            gv.frame = this._owner.getProp(fgui.ObjectPropID.Frame);
        }
    }
    fgui.GearAnimation = GearAnimation;
    class GearAnimationValue {
        constructor(playing = true, frame = 0) {
            this.playing = playing;
            this.frame = frame;
        }
    }
})(fgui || (fgui = {}));

(function (fgui) {
    class GearColor extends fgui.GearBase {
        constructor(owner) {
            super(owner);
        }
        init() {
            this._default = new GearColorValue(this._owner.getProp(fgui.ObjectPropID.Color), this._owner.getProp(fgui.ObjectPropID.OutlineColor));
            this._storage = {};
        }
        addStatus(pageId, buffer) {
            var gv;
            if (pageId == null)
                gv = this._default;
            else {
                gv = new GearColorValue();
                this._storage[pageId] = gv;
            }
            gv.color = buffer.readColorS();
            gv.strokeColor = buffer.readColorS();
        }
        apply() {
            this._owner._gearLocked = true;
            var gv = this._storage[this._controller.selectedPageId];
            if (!gv)
                gv = this._default;
            this._owner.setProp(fgui.ObjectPropID.Color, gv.color);
            if (gv.strokeColor != null)
                this._owner.setProp(fgui.ObjectPropID.OutlineColor, gv.strokeColor);
            this._owner._gearLocked = false;
        }
        updateState() {
            var gv = this._storage[this._controller.selectedPageId];
            if (!gv) {
                gv = new GearColorValue(null, null);
                this._storage[this._controller.selectedPageId] = gv;
            }
            gv.color = this._owner.getProp(fgui.ObjectPropID.Color);
            gv.strokeColor = this._owner.getProp(fgui.ObjectPropID.OutlineColor);
        }
    }
    fgui.GearColor = GearColor;
    class GearColorValue {
        constructor(color = null, strokeColor = null) {
            this.color = color;
            this.strokeColor = strokeColor;
        }
    }
})(fgui || (fgui = {}));

(function (fgui) {
    class GearDisplay extends fgui.GearBase {
        constructor(owner) {
            super(owner);
            this._visible = 0;
            this._displayLockToken = 0;
            this._displayLockToken = 1;
        }
        init() {
            this.pages = null;
        }
        addLock() {
            this._visible++;
            return this._displayLockToken;
        }
        releaseLock(token) {
            if (token == this._displayLockToken)
                this._visible--;
        }
        get connected() {
            return this._controller == null || this._visible > 0;
        }
        apply() {
            this._displayLockToken++;
            if (this._displayLockToken <= 0)
                this._displayLockToken = 1;
            if (this.pages == null || this.pages.length == 0
                || this.pages.indexOf(this._controller.selectedPageId) != -1)
                this._visible = 1;
            else
                this._visible = 0;
        }
    }
    fgui.GearDisplay = GearDisplay;
})(fgui || (fgui = {}));

(function (fgui) {
    class GearDisplay2 extends fgui.GearBase {
        constructor(owner) {
            super(owner);
            this._visible = 0;
        }
        init() {
            this.pages = null;
        }
        apply() {
            if (this.pages == null || this.pages.length == 0
                || this.pages.indexOf(this._controller.selectedPageId) != -1)
                this._visible = 1;
            else
                this._visible = 0;
        }
        evaluate(connected) {
            var v = this._controller == null || this._visible > 0;
            if (this.condition == 0)
                v = v && connected;
            else
                v = v || connected;
            return v;
        }
    }
    fgui.GearDisplay2 = GearDisplay2;
})(fgui || (fgui = {}));

(function (fgui) {
    class GearFontSize extends fgui.GearBase {
        constructor(owner) {
            super(owner);
            this._default = 0;
        }
        init() {
            this._default = this._owner.getProp(fgui.ObjectPropID.FontSize);
            this._storage = {};
        }
        addStatus(pageId, buffer) {
            if (pageId == null)
                this._default = buffer.getInt32();
            else
                this._storage[pageId] = buffer.getInt32();
        }
        apply() {
            this._owner._gearLocked = true;
            var data = this._storage[this._controller.selectedPageId];
            if (data != undefined)
                this._owner.setProp(fgui.ObjectPropID.FontSize, data);
            else
                this._owner.setProp(fgui.ObjectPropID.FontSize, this._default);
            this._owner._gearLocked = false;
        }
        updateState() {
            this._storage[this._controller.selectedPageId] = this._owner.text;
        }
    }
    fgui.GearFontSize = GearFontSize;
})(fgui || (fgui = {}));

(function (fgui) {
    class GearIcon extends fgui.GearBase {
        constructor(owner) {
            super(owner);
        }
        init() {
            this._default = this._owner.icon;
            this._storage = {};
        }
        addStatus(pageId, buffer) {
            if (pageId == null)
                this._default = buffer.readS();
            else
                this._storage[pageId] = buffer.readS();
        }
        apply() {
            this._owner._gearLocked = true;
            var data = this._storage[this._controller.selectedPageId];
            if (data !== undefined)
                this._owner.icon = data;
            else
                this._owner.icon = this._default;
            this._owner._gearLocked = false;
        }
        updateState() {
            this._storage[this._controller.selectedPageId] = this._owner.icon;
        }
    }
    fgui.GearIcon = GearIcon;
})(fgui || (fgui = {}));

(function (fgui) {
    class GearLook extends fgui.GearBase {
        constructor(owner) {
            super(owner);
        }
        init() {
            this._default = new GearLookValue(this._owner.alpha, this._owner.rotation, this._owner.grayed, this._owner.touchable);
            this._storage = {};
        }
        addStatus(pageId, buffer) {
            var gv;
            if (pageId == null)
                gv = this._default;
            else {
                gv = new GearLookValue();
                this._storage[pageId] = gv;
            }
            gv.alpha = buffer.getFloat32();
            gv.rotation = buffer.getFloat32();
            gv.grayed = buffer.readBool();
            gv.touchable = buffer.readBool();
        }
        apply() {
            var gv = this._storage[this._controller.selectedPageId];
            if (!gv)
                gv = this._default;
            if (this._tweenConfig != null && this._tweenConfig.tween && !fgui.UIPackage._constructing && !fgui.GearBase.disableAllTweenEffect) {
                this._owner._gearLocked = true;
                this._owner.grayed = gv.grayed;
                this._owner.touchable = gv.touchable;
                this._owner._gearLocked = false;
                if (this._tweenConfig._tweener != null) {
                    if (this._tweenConfig._tweener.endValue.x != gv.alpha || this._tweenConfig._tweener.endValue.y != gv.rotation) {
                        this._tweenConfig._tweener.kill(true);
                        this._tweenConfig._tweener = null;
                    }
                    else
                        return;
                }
                var a = gv.alpha != this._owner.alpha;
                var b = gv.rotation != this._owner.rotation;
                if (a || b) {
                    if (this._owner.checkGearController(0, this._controller))
                        this._tweenConfig._displayLockToken = this._owner.addDisplayLock();
                    this._tweenConfig._tweener = fgui.GTween.to2(this._owner.alpha, this._owner.rotation, gv.alpha, gv.rotation, this._tweenConfig.duration)
                        .setDelay(this._tweenConfig.delay)
                        .setEase(this._tweenConfig.easeType)
                        .setUserData((a ? 1 : 0) + (b ? 2 : 0))
                        .setTarget(this)
                        .onUpdate(this.__tweenUpdate, this)
                        .onComplete(this.__tweenComplete, this);
                }
            }
            else {
                this._owner._gearLocked = true;
                this._owner.grayed = gv.grayed;
                this._owner.alpha = gv.alpha;
                this._owner.rotation = gv.rotation;
                this._owner.touchable = gv.touchable;
                this._owner._gearLocked = false;
            }
        }
        __tweenUpdate(tweener) {
            var flag = tweener.userData;
            this._owner._gearLocked = true;
            if ((flag & 1) != 0)
                this._owner.alpha = tweener.value.x;
            if ((flag & 2) != 0)
                this._owner.rotation = tweener.value.y;
            this._owner._gearLocked = false;
        }
        __tweenComplete() {
            if (this._tweenConfig._displayLockToken != 0) {
                this._owner.releaseDisplayLock(this._tweenConfig._displayLockToken);
                this._tweenConfig._displayLockToken = 0;
            }
            this._tweenConfig._tweener = null;
        }
        updateState() {
            var gv = this._storage[this._controller.selectedPageId];
            if (!gv) {
                gv = new GearLookValue();
                this._storage[this._controller.selectedPageId] = gv;
            }
            gv.alpha = this._owner.alpha;
            gv.rotation = this._owner.rotation;
            gv.grayed = this._owner.grayed;
            gv.touchable = this._owner.touchable;
        }
    }
    fgui.GearLook = GearLook;
    class GearLookValue {
        constructor(alpha = 0, rotation = 0, grayed = false, touchable = true) {
            this.alpha = alpha;
            this.rotation = rotation;
            this.grayed = grayed;
            this.touchable = touchable;
        }
    }
})(fgui || (fgui = {}));

(function (fgui) {
    class GearSize extends fgui.GearBase {
        constructor(owner) {
            super(owner);
        }
        init() {
            this._default = new GearSizeValue(this._owner.width, this._owner.height, this._owner.scaleX, this._owner.scaleY);
            this._storage = {};
        }
        addStatus(pageId, buffer) {
            var gv;
            if (pageId == null)
                gv = this._default;
            else {
                gv = new GearSizeValue();
                this._storage[pageId] = gv;
            }
            gv.width = buffer.getInt32();
            gv.height = buffer.getInt32();
            gv.scaleX = buffer.getFloat32();
            gv.scaleY = buffer.getFloat32();
        }
        apply() {
            var gv = this._storage[this._controller.selectedPageId];
            if (!gv)
                gv = this._default;
            if (this._tweenConfig != null && this._tweenConfig.tween && !fgui.UIPackage._constructing && !fgui.GearBase.disableAllTweenEffect) {
                if (this._tweenConfig._tweener != null) {
                    if (this._tweenConfig._tweener.endValue.x != gv.width || this._tweenConfig._tweener.endValue.y != gv.height
                        || this._tweenConfig._tweener.endValue.z != gv.scaleX || this._tweenConfig._tweener.endValue.w != gv.scaleY) {
                        this._tweenConfig._tweener.kill(true);
                        this._tweenConfig._tweener = null;
                    }
                    else
                        return;
                }
                var a = gv.width != this._owner.width || gv.height != this._owner.height;
                var b = gv.scaleX != this._owner.scaleX || gv.scaleY != this._owner.scaleY;
                if (a || b) {
                    if (this._owner.checkGearController(0, this._controller))
                        this._tweenConfig._displayLockToken = this._owner.addDisplayLock();
                    this._tweenConfig._tweener = fgui.GTween.to4(this._owner.width, this._owner.height, this._owner.scaleX, this._owner.scaleY, gv.width, gv.height, gv.scaleX, gv.scaleY, this._tweenConfig.duration)
                        .setDelay(this._tweenConfig.delay)
                        .setEase(this._tweenConfig.easeType)
                        .setUserData((a ? 1 : 0) + (b ? 2 : 0))
                        .setTarget(this)
                        .onUpdate(this.__tweenUpdate, this)
                        .onComplete(this.__tweenComplete, this);
                }
            }
            else {
                this._owner._gearLocked = true;
                this._owner.setSize(gv.width, gv.height, this._owner.checkGearController(1, this._controller));
                this._owner.setScale(gv.scaleX, gv.scaleY);
                this._owner._gearLocked = false;
            }
        }
        __tweenUpdate(tweener) {
            var flag = tweener.userData;
            this._owner._gearLocked = true;
            if ((flag & 1) != 0)
                this._owner.setSize(tweener.value.x, tweener.value.y, this._owner.checkGearController(1, this._controller));
            if ((flag & 2) != 0)
                this._owner.setScale(tweener.value.z, tweener.value.w);
            this._owner._gearLocked = false;
        }
        __tweenComplete() {
            if (this._tweenConfig._displayLockToken != 0) {
                this._owner.releaseDisplayLock(this._tweenConfig._displayLockToken);
                this._tweenConfig._displayLockToken = 0;
            }
            this._tweenConfig._tweener = null;
        }
        updateState() {
            var gv = this._storage[this._controller.selectedPageId];
            if (!gv) {
                gv = new GearSizeValue();
                this._storage[this._controller.selectedPageId] = gv;
            }
            gv.width = this._owner.width;
            gv.height = this._owner.height;
            gv.scaleX = this._owner.scaleX;
            gv.scaleY = this._owner.scaleY;
        }
        updateFromRelations(dx, dy) {
            if (this._controller == null || this._storage == null)
                return;
            for (var key in this._storage) {
                var gv = this._storage[key];
                gv.width += dx;
                gv.height += dy;
            }
            this._default.width += dx;
            this._default.height += dy;
            this.updateState();
        }
    }
    fgui.GearSize = GearSize;
    class GearSizeValue {
        constructor(width = 0, height = 0, scaleX = 0, scaleY = 0) {
            this.width = width;
            this.height = height;
            this.scaleX = scaleX;
            this.scaleY = scaleY;
        }
    }
})(fgui || (fgui = {}));

(function (fgui) {
    class GearText extends fgui.GearBase {
        constructor(owner) {
            super(owner);
        }
        init() {
            this._default = this._owner.text;
            this._storage = {};
        }
        addStatus(pageId, buffer) {
            if (pageId == null)
                this._default = buffer.readS();
            else
                this._storage[pageId] = buffer.readS();
        }
        apply() {
            this._owner._gearLocked = true;
            var data = this._storage[this._controller.selectedPageId];
            if (data !== undefined)
                this._owner.text = data;
            else
                this._owner.text = this._default;
            this._owner._gearLocked = false;
        }
        updateState() {
            this._storage[this._controller.selectedPageId] = this._owner.text;
        }
    }
    fgui.GearText = GearText;
})(fgui || (fgui = {}));

(function (fgui) {
    class GearXY extends fgui.GearBase {
        constructor(owner) {
            super(owner);
        }
        init() {
            this._default = {
                x: this._owner.x, y: this._owner.y,
                px: this._owner.x / this._owner.parent.width, py: this._owner.y / this._owner.parent.height
            };
            this._storage = {};
        }
        addStatus(pageId, buffer) {
            var gv;
            if (pageId == null)
                gv = this._default;
            else {
                gv = {};
                this._storage[pageId] = gv;
            }
            gv.x = buffer.getInt32();
            gv.y = buffer.getInt32();
        }
        addExtStatus(pageId, buffer) {
            var gv;
            if (pageId == null)
                gv = this._default;
            else
                gv = this._storage[pageId];
            gv.px = buffer.getFloat32();
            gv.py = buffer.getFloat32();
        }
        apply() {
            var pt = this._storage[this._controller.selectedPageId];
            if (!pt)
                pt = this._default;
            var ex;
            var ey;
            if (this.positionsInPercent && this._owner.parent) {
                ex = pt.px * this._owner.parent.width;
                ey = pt.py * this._owner.parent.height;
            }
            else {
                ex = pt.x;
                ey = pt.y;
            }
            if (this._tweenConfig != null && this._tweenConfig.tween && !fgui.UIPackage._constructing && !fgui.GearBase.disableAllTweenEffect) {
                if (this._tweenConfig._tweener != null) {
                    if (this._tweenConfig._tweener.endValue.x != ex || this._tweenConfig._tweener.endValue.y != ey) {
                        this._tweenConfig._tweener.kill(true);
                        this._tweenConfig._tweener = null;
                    }
                    else
                        return;
                }
                var ox = this._owner.x;
                var oy = this._owner.y;
                if (ox != ex || oy != ey) {
                    if (this._owner.checkGearController(0, this._controller))
                        this._tweenConfig._displayLockToken = this._owner.addDisplayLock();
                    this._tweenConfig._tweener = fgui.GTween.to2(ox, oy, ex, ey, this._tweenConfig.duration)
                        .setDelay(this._tweenConfig.delay)
                        .setEase(this._tweenConfig.easeType)
                        .setTarget(this)
                        .onUpdate(this.__tweenUpdate, this)
                        .onComplete(this.__tweenComplete, this);
                }
            }
            else {
                this._owner._gearLocked = true;
                this._owner.setXY(ex, ey);
                this._owner._gearLocked = false;
            }
        }
        __tweenUpdate(tweener) {
            this._owner._gearLocked = true;
            this._owner.setXY(tweener.value.x, tweener.value.y);
            this._owner._gearLocked = false;
        }
        __tweenComplete() {
            if (this._tweenConfig._displayLockToken != 0) {
                this._owner.releaseDisplayLock(this._tweenConfig._displayLockToken);
                this._tweenConfig._displayLockToken = 0;
            }
            this._tweenConfig._tweener = null;
        }
        updateState() {
            var pt = this._storage[this._controller.selectedPageId];
            if (!pt) {
                pt = {};
                this._storage[this._controller.selectedPageId] = pt;
            }
            pt.x = this._owner.x;
            pt.y = this._owner.y;
            pt.px = this._owner.x / this._owner.parent.width;
            pt.py = this._owner.y / this._owner.parent.height;
        }
        updateFromRelations(dx, dy) {
            if (this._controller == null || this._storage == null || this.positionsInPercent)
                return;
            for (var key in this._storage) {
                var pt = this._storage[key];
                pt.x += dx;
                pt.y += dy;
            }
            this._default.x += dx;
            this._default.y += dy;
            this.updateState();
        }
    }
    fgui.GearXY = GearXY;
})(fgui || (fgui = {}));

(function (fgui) {
    class EaseManager {
        static evaluate(easeType, time, duration, overshootOrAmplitude, period) {
            switch (easeType) {
                case fgui.EaseType.Linear:
                    return time / duration;
                case fgui.EaseType.SineIn:
                    return -Math.cos(time / duration * EaseManager._PiOver2) + 1;
                case fgui.EaseType.SineOut:
                    return Math.sin(time / duration * EaseManager._PiOver2);
                case fgui.EaseType.SineInOut:
                    return -0.5 * (Math.cos(Math.PI * time / duration) - 1);
                case fgui.EaseType.QuadIn:
                    return (time /= duration) * time;
                case fgui.EaseType.QuadOut:
                    return -(time /= duration) * (time - 2);
                case fgui.EaseType.QuadInOut:
                    if ((time /= duration * 0.5) < 1)
                        return 0.5 * time * time;
                    return -0.5 * ((--time) * (time - 2) - 1);
                case fgui.EaseType.CubicIn:
                    return (time /= duration) * time * time;
                case fgui.EaseType.CubicOut:
                    return ((time = time / duration - 1) * time * time + 1);
                case fgui.EaseType.CubicInOut:
                    if ((time /= duration * 0.5) < 1)
                        return 0.5 * time * time * time;
                    return 0.5 * ((time -= 2) * time * time + 2);
                case fgui.EaseType.QuartIn:
                    return (time /= duration) * time * time * time;
                case fgui.EaseType.QuartOut:
                    return -((time = time / duration - 1) * time * time * time - 1);
                case fgui.EaseType.QuartInOut:
                    if ((time /= duration * 0.5) < 1)
                        return 0.5 * time * time * time * time;
                    return -0.5 * ((time -= 2) * time * time * time - 2);
                case fgui.EaseType.QuintIn:
                    return (time /= duration) * time * time * time * time;
                case fgui.EaseType.QuintOut:
                    return ((time = time / duration - 1) * time * time * time * time + 1);
                case fgui.EaseType.QuintInOut:
                    if ((time /= duration * 0.5) < 1)
                        return 0.5 * time * time * time * time * time;
                    return 0.5 * ((time -= 2) * time * time * time * time + 2);
                case fgui.EaseType.ExpoIn:
                    return (time == 0) ? 0 : Math.pow(2, 10 * (time / duration - 1));
                case fgui.EaseType.ExpoOut:
                    if (time == duration)
                        return 1;
                    return (-Math.pow(2, -10 * time / duration) + 1);
                case fgui.EaseType.ExpoInOut:
                    if (time == 0)
                        return 0;
                    if (time == duration)
                        return 1;
                    if ((time /= duration * 0.5) < 1)
                        return 0.5 * Math.pow(2, 10 * (time - 1));
                    return 0.5 * (-Math.pow(2, -10 * --time) + 2);
                case fgui.EaseType.CircIn:
                    return -(Math.sqrt(1 - (time /= duration) * time) - 1);
                case fgui.EaseType.CircOut:
                    return Math.sqrt(1 - (time = time / duration - 1) * time);
                case fgui.EaseType.CircInOut:
                    if ((time /= duration * 0.5) < 1)
                        return -0.5 * (Math.sqrt(1 - time * time) - 1);
                    return 0.5 * (Math.sqrt(1 - (time -= 2) * time) + 1);
                case fgui.EaseType.ElasticIn:
                    var s0;
                    if (time == 0)
                        return 0;
                    if ((time /= duration) == 1)
                        return 1;
                    if (period == 0)
                        period = duration * 0.3;
                    if (overshootOrAmplitude < 1) {
                        overshootOrAmplitude = 1;
                        s0 = period / 4;
                    }
                    else
                        s0 = period / EaseManager._TwoPi * Math.asin(1 / overshootOrAmplitude);
                    return -(overshootOrAmplitude * Math.pow(2, 10 * (time -= 1)) * Math.sin((time * duration - s0) * EaseManager._TwoPi / period));
                case fgui.EaseType.ElasticOut:
                    var s1;
                    if (time == 0)
                        return 0;
                    if ((time /= duration) == 1)
                        return 1;
                    if (period == 0)
                        period = duration * 0.3;
                    if (overshootOrAmplitude < 1) {
                        overshootOrAmplitude = 1;
                        s1 = period / 4;
                    }
                    else
                        s1 = period / EaseManager._TwoPi * Math.asin(1 / overshootOrAmplitude);
                    return (overshootOrAmplitude * Math.pow(2, -10 * time) * Math.sin((time * duration - s1) * EaseManager._TwoPi / period) + 1);
                case fgui.EaseType.ElasticInOut:
                    var s;
                    if (time == 0)
                        return 0;
                    if ((time /= duration * 0.5) == 2)
                        return 1;
                    if (period == 0)
                        period = duration * (0.3 * 1.5);
                    if (overshootOrAmplitude < 1) {
                        overshootOrAmplitude = 1;
                        s = period / 4;
                    }
                    else
                        s = period / EaseManager._TwoPi * Math.asin(1 / overshootOrAmplitude);
                    if (time < 1)
                        return -0.5 * (overshootOrAmplitude * Math.pow(2, 10 * (time -= 1)) * Math.sin((time * duration - s) * EaseManager._TwoPi / period));
                    return overshootOrAmplitude * Math.pow(2, -10 * (time -= 1)) * Math.sin((time * duration - s) * EaseManager._TwoPi / period) * 0.5 + 1;
                case fgui.EaseType.BackIn:
                    return (time /= duration) * time * ((overshootOrAmplitude + 1) * time - overshootOrAmplitude);
                case fgui.EaseType.BackOut:
                    return ((time = time / duration - 1) * time * ((overshootOrAmplitude + 1) * time + overshootOrAmplitude) + 1);
                case fgui.EaseType.BackInOut:
                    if ((time /= duration * 0.5) < 1)
                        return 0.5 * (time * time * (((overshootOrAmplitude *= (1.525)) + 1) * time - overshootOrAmplitude));
                    return 0.5 * ((time -= 2) * time * (((overshootOrAmplitude *= (1.525)) + 1) * time + overshootOrAmplitude) + 2);
                case fgui.EaseType.BounceIn:
                    return Bounce.easeIn(time, duration);
                case fgui.EaseType.BounceOut:
                    return Bounce.easeOut(time, duration);
                case fgui.EaseType.BounceInOut:
                    return Bounce.easeInOut(time, duration);
                default:
                    return -(time /= duration) * (time - 2);
            }
        }
    }
    EaseManager._PiOver2 = Math.PI * 0.5;
    EaseManager._TwoPi = Math.PI * 2;
    fgui.EaseManager = EaseManager;
    class Bounce {
        static easeIn(time, duration) {
            return 1 - Bounce.easeOut(duration - time, duration);
        }
        static easeOut(time, duration) {
            if ((time /= duration) < (1 / 2.75)) {
                return (7.5625 * time * time);
            }
            if (time < (2 / 2.75)) {
                return (7.5625 * (time -= (1.5 / 2.75)) * time + 0.75);
            }
            if (time < (2.5 / 2.75)) {
                return (7.5625 * (time -= (2.25 / 2.75)) * time + 0.9375);
            }
            return (7.5625 * (time -= (2.625 / 2.75)) * time + 0.984375);
        }
        static easeInOut(time, duration) {
            if (time < duration * 0.5) {
                return Bounce.easeIn(time * 2, duration) * 0.5;
            }
            return Bounce.easeOut(time * 2 - duration, duration) * 0.5 + 0.5;
        }
    }
})(fgui || (fgui = {}));

(function (fgui) {
    class EaseType {
    }
    EaseType.Linear = 0;
    EaseType.SineIn = 1;
    EaseType.SineOut = 2;
    EaseType.SineInOut = 3;
    EaseType.QuadIn = 4;
    EaseType.QuadOut = 5;
    EaseType.QuadInOut = 6;
    EaseType.CubicIn = 7;
    EaseType.CubicOut = 8;
    EaseType.CubicInOut = 9;
    EaseType.QuartIn = 10;
    EaseType.QuartOut = 11;
    EaseType.QuartInOut = 12;
    EaseType.QuintIn = 13;
    EaseType.QuintOut = 14;
    EaseType.QuintInOut = 15;
    EaseType.ExpoIn = 16;
    EaseType.ExpoOut = 17;
    EaseType.ExpoInOut = 18;
    EaseType.CircIn = 19;
    EaseType.CircOut = 20;
    EaseType.CircInOut = 21;
    EaseType.ElasticIn = 22;
    EaseType.ElasticOut = 23;
    EaseType.ElasticInOut = 24;
    EaseType.BackIn = 25;
    EaseType.BackOut = 26;
    EaseType.BackInOut = 27;
    EaseType.BounceIn = 28;
    EaseType.BounceOut = 29;
    EaseType.BounceInOut = 30;
    EaseType.Custom = 31;
    fgui.EaseType = EaseType;
})(fgui || (fgui = {}));

(function (fgui) {
    class GPath {
        constructor() {
            this._segments = new Array();
            this._points = new Array();
        }
        get length() {
            return this._fullLength;
        }
        create2(pt1, pt2, pt3, pt4) {
            var points = new Array();
            points.push(pt1);
            points.push(pt2);
            if (pt3)
                points.push(pt3);
            if (pt4)
                points.push(pt4);
            this.create(points);
        }
        create(points) {
            this._segments.length = 0;
            this._points.length = 0;
            this._fullLength = 0;
            var cnt = points.length;
            if (cnt == 0)
                return;
            var splinePoints = GPath.helperPoints;
            splinePoints.length = 0;
            var prev = points[0];
            if (prev.curveType == fgui.CurveType.CRSpline)
                splinePoints.push(new Laya.Point(prev.x, prev.y));
            for (var i = 1; i < cnt; i++) {
                var current = points[i];
                if (prev.curveType != fgui.CurveType.CRSpline) {
                    var seg = new Segment();
                    seg.type = prev.curveType;
                    seg.ptStart = this._points.length;
                    if (prev.curveType == fgui.CurveType.Straight) {
                        seg.ptCount = 2;
                        this._points.push(new Laya.Point(prev.x, prev.y));
                        this._points.push(new Laya.Point(current.x, current.y));
                    }
                    else if (prev.curveType == fgui.CurveType.Bezier) {
                        seg.ptCount = 3;
                        this._points.push(new Laya.Point(prev.x, prev.y));
                        this._points.push(new Laya.Point(current.x, current.y));
                        this._points.push(new Laya.Point(prev.control1_x, prev.control1_y));
                    }
                    else if (prev.curveType == fgui.CurveType.CubicBezier) {
                        seg.ptCount = 4;
                        this._points.push(new Laya.Point(prev.x, prev.y));
                        this._points.push(new Laya.Point(current.x, current.y));
                        this._points.push(new Laya.Point(prev.control1_x, prev.control1_y));
                        this._points.push(new Laya.Point(prev.control2_x, prev.control2_y));
                    }
                    seg.length = fgui.ToolSet.distance(prev.x, prev.y, current.x, current.y);
                    this._fullLength += seg.length;
                    this._segments.push(seg);
                }
                if (current.curveType != fgui.CurveType.CRSpline) {
                    if (splinePoints.length > 0) {
                        splinePoints.push(new Laya.Point(current.x, current.y));
                        this.createSplineSegment();
                    }
                }
                else
                    splinePoints.push(new Laya.Point(current.x, current.y));
                prev = current;
            }
            if (splinePoints.length > 1)
                this.createSplineSegment();
        }
        createSplineSegment() {
            var splinePoints = GPath.helperPoints;
            var cnt = splinePoints.length;
            splinePoints.splice(0, 0, splinePoints[0]);
            splinePoints.push(splinePoints[cnt]);
            splinePoints.push(splinePoints[cnt]);
            cnt += 3;
            var seg = new Segment();
            seg.type = fgui.CurveType.CRSpline;
            seg.ptStart = this._points.length;
            seg.ptCount = cnt;
            this._points = this._points.concat(splinePoints);
            seg.length = 0;
            for (var i = 1; i < cnt; i++) {
                seg.length += fgui.ToolSet.distance(splinePoints[i - 1].x, splinePoints[i - 1].y, splinePoints[i].x, splinePoints[i].y);
            }
            this._fullLength += seg.length;
            this._segments.push(seg);
            splinePoints.length = 0;
        }
        clear() {
            this._segments.length = 0;
            this._points.length = 0;
        }
        getPointAt(t, result) {
            if (!result)
                result = new Laya.Point();
            else
                result.setTo(0, 0);
            t = fgui.ToolSet.clamp01(t);
            var cnt = this._segments.length;
            if (cnt == 0) {
                return result;
            }
            var seg;
            if (t == 1) {
                seg = this._segments[cnt - 1];
                if (seg.type == fgui.CurveType.Straight) {
                    result.x = fgui.ToolSet.lerp(this._points[seg.ptStart].x, this._points[seg.ptStart + 1].x, t);
                    result.y = fgui.ToolSet.lerp(this._points[seg.ptStart].y, this._points[seg.ptStart + 1].y, t);
                    return result;
                }
                else if (seg.type == fgui.CurveType.Bezier || seg.type == fgui.CurveType.CubicBezier)
                    return this.onBezierCurve(seg.ptStart, seg.ptCount, t, result);
                else
                    return this.onCRSplineCurve(seg.ptStart, seg.ptCount, t, result);
            }
            var len = t * this._fullLength;
            for (var i = 0; i < cnt; i++) {
                seg = this._segments[i];
                len -= seg.length;
                if (len < 0) {
                    t = 1 + len / seg.length;
                    if (seg.type == fgui.CurveType.Straight) {
                        result.x = fgui.ToolSet.lerp(this._points[seg.ptStart].x, this._points[seg.ptStart + 1].x, t);
                        result.y = fgui.ToolSet.lerp(this._points[seg.ptStart].y, this._points[seg.ptStart + 1].y, t);
                    }
                    else if (seg.type == fgui.CurveType.Bezier || seg.type == fgui.CurveType.CubicBezier)
                        result = this.onBezierCurve(seg.ptStart, seg.ptCount, t, result);
                    else
                        result = this.onCRSplineCurve(seg.ptStart, seg.ptCount, t, result);
                    break;
                }
            }
            return result;
        }
        get segmentCount() {
            return this._segments.length;
        }
        getAnchorsInSegment(segmentIndex, points) {
            if (points == null)
                points = new Array();
            var seg = this._segments[segmentIndex];
            for (var i = 0; i < seg.ptCount; i++)
                points.push(new Laya.Point(this._points[seg.ptStart + i].x, this._points[seg.ptStart + i].y));
            return points;
        }
        getPointsInSegment(segmentIndex, t0, t1, points, ts, pointDensity) {
            if (points == null)
                points = new Array();
            if (!pointDensity || isNaN(pointDensity))
                pointDensity = 0.1;
            if (ts)
                ts.push(t0);
            var seg = this._segments[segmentIndex];
            if (seg.type == fgui.CurveType.Straight) {
                points.push(new Laya.Point(fgui.ToolSet.lerp(this._points[seg.ptStart].x, this._points[seg.ptStart + 1].x, t0), fgui.ToolSet.lerp(this._points[seg.ptStart].y, this._points[seg.ptStart + 1].y, t0)));
                points.push(new Laya.Point(fgui.ToolSet.lerp(this._points[seg.ptStart].x, this._points[seg.ptStart + 1].x, t1), fgui.ToolSet.lerp(this._points[seg.ptStart].y, this._points[seg.ptStart + 1].y, t1)));
            }
            else {
                var func;
                if (seg.type == fgui.CurveType.Bezier || seg.type == fgui.CurveType.CubicBezier)
                    func = this.onBezierCurve;
                else
                    func = this.onCRSplineCurve;
                points.push(func.call(this, seg.ptStart, seg.ptCount, t0, new Laya.Point()));
                var SmoothAmount = Math.min(seg.length * pointDensity, 50);
                for (var j = 0; j <= SmoothAmount; j++) {
                    var t = j / SmoothAmount;
                    if (t > t0 && t < t1) {
                        points.push(func.call(this, seg.ptStart, seg.ptCount, t, new Laya.Point()));
                        if (ts != null)
                            ts.push(t);
                    }
                }
                points.push(func.call(this, seg.ptStart, seg.ptCount, t1, new Laya.Point()));
            }
            if (ts != null)
                ts.push(t1);
            return points;
        }
        getAllPoints(points, ts, pointDensity) {
            if (points == null)
                points = new Array();
            if (!pointDensity || isNaN(pointDensity))
                pointDensity = 0.1;
            var cnt = this._segments.length;
            for (var i = 0; i < cnt; i++)
                this.getPointsInSegment(i, 0, 1, points, ts, pointDensity);
            return points;
        }
        onCRSplineCurve(ptStart, ptCount, t, result) {
            var adjustedIndex = Math.floor(t * (ptCount - 4)) + ptStart;
            var p0x = this._points[adjustedIndex].x;
            var p0y = this._points[adjustedIndex].y;
            var p1x = this._points[adjustedIndex + 1].x;
            var p1y = this._points[adjustedIndex + 1].y;
            var p2x = this._points[adjustedIndex + 2].x;
            var p2y = this._points[adjustedIndex + 2].y;
            var p3x = this._points[adjustedIndex + 3].x;
            var p3y = this._points[adjustedIndex + 3].y;
            var adjustedT = (t == 1) ? 1 : fgui.ToolSet.repeat(t * (ptCount - 4), 1);
            var t0 = ((-adjustedT + 2) * adjustedT - 1) * adjustedT * 0.5;
            var t1 = (((3 * adjustedT - 5) * adjustedT) * adjustedT + 2) * 0.5;
            var t2 = ((-3 * adjustedT + 4) * adjustedT + 1) * adjustedT * 0.5;
            var t3 = ((adjustedT - 1) * adjustedT * adjustedT) * 0.5;
            result.x = p0x * t0 + p1x * t1 + p2x * t2 + p3x * t3;
            result.y = p0y * t0 + p1y * t1 + p2y * t2 + p3y * t3;
            return result;
        }
        onBezierCurve(ptStart, ptCount, t, result) {
            var t2 = 1 - t;
            var p0x = this._points[ptStart].x;
            var p0y = this._points[ptStart].y;
            var p1x = this._points[ptStart + 1].x;
            var p1y = this._points[ptStart + 1].y;
            var cp0x = this._points[ptStart + 2].x;
            var cp0y = this._points[ptStart + 2].y;
            if (ptCount == 4) {
                var cp1x = this._points[ptStart + 3].x;
                var cp1y = this._points[ptStart + 3].y;
                result.x = t2 * t2 * t2 * p0x + 3 * t2 * t2 * t * cp0x + 3 * t2 * t * t * cp1x + t * t * t * p1x;
                result.y = t2 * t2 * t2 * p0y + 3 * t2 * t2 * t * cp0y + 3 * t2 * t * t * cp1y + t * t * t * p1y;
            }
            else {
                result.x = t2 * t2 * p0x + 2 * t2 * t * cp0x + t * t * p1x;
                result.y = t2 * t2 * p0y + 2 * t2 * t * cp0y + t * t * p1y;
            }
            return result;
        }
    }
    GPath.helperPoints = new Array();
    fgui.GPath = GPath;
    class Segment {
    }
})(fgui || (fgui = {}));

(function (fgui) {
    let CurveType;
    (function (CurveType) {
        CurveType[CurveType["CRSpline"] = 0] = "CRSpline";
        CurveType[CurveType["Bezier"] = 1] = "Bezier";
        CurveType[CurveType["CubicBezier"] = 2] = "CubicBezier";
        CurveType[CurveType["Straight"] = 3] = "Straight";
    })(CurveType = fgui.CurveType || (fgui.CurveType = {}));
    class GPathPoint {
        constructor() {
            this.x = 0;
            this.y = 0;
            this.control1_x = 0;
            this.control1_y = 0;
            this.control2_x = 0;
            this.control2_y = 0;
            this.curveType = 0;
        }
        static newPoint(x = 0, y = 0, curveType = 0) {
            var pt = new GPathPoint();
            pt.x = x;
            pt.y = y;
            pt.control1_x = 0;
            pt.control1_y = 0;
            pt.control2_x = 0;
            pt.control2_y = 0;
            pt.curveType = curveType;
            return pt;
        }
        static newBezierPoint(x = 0, y = 0, control1_x = 0, control1_y = 0) {
            var pt = new GPathPoint();
            pt.x = x;
            pt.y = y;
            pt.control1_x = control1_x;
            pt.control1_y = control1_y;
            pt.control2_x = 0;
            pt.control2_y = 0;
            pt.curveType = CurveType.Bezier;
            return pt;
        }
        static newCubicBezierPoint(x = 0, y = 0, control1_x = 0, control1_y = 0, control2_x = 0, control2_y = 0) {
            var pt = new GPathPoint();
            pt.x = x;
            pt.y = y;
            pt.control1_x = control1_x;
            pt.control1_y = control1_y;
            pt.control2_x = control2_x;
            pt.control2_y = control2_y;
            pt.curveType = CurveType.CubicBezier;
            return pt;
        }
        clone() {
            var ret = new GPathPoint();
            ret.x = this.x;
            ret.y = this.y;
            ret.control1_x = this.control1_x;
            ret.control1_y = this.control1_y;
            ret.control2_x = this.control2_x;
            ret.control2_y = this.control2_y;
            ret.curveType = this.curveType;
            return ret;
        }
    }
    fgui.GPathPoint = GPathPoint;
})(fgui || (fgui = {}));

(function (fgui) {
    class GTween {
        static to(start, end, duration) {
            return fgui.TweenManager.createTween()._to(start, end, duration);
        }
        static to2(start, start2, end, end2, duration) {
            return fgui.TweenManager.createTween()._to2(start, start2, end, end2, duration);
        }
        static to3(start, start2, start3, end, end2, end3, duration) {
            return fgui.TweenManager.createTween()._to3(start, start2, start3, end, end2, end3, duration);
        }
        static to4(start, start2, start3, start4, end, end2, end3, end4, duration) {
            return fgui.TweenManager.createTween()._to4(start, start2, start3, start4, end, end2, end3, end4, duration);
        }
        static toColor(start, end, duration) {
            return fgui.TweenManager.createTween()._toColor(start, end, duration);
        }
        static delayedCall(delay) {
            return fgui.TweenManager.createTween().setDelay(delay);
        }
        static shake(startX, startY, amplitude, duration) {
            return fgui.TweenManager.createTween()._shake(startX, startY, amplitude, duration);
        }
        static isTweening(target, propType) {
            return fgui.TweenManager.isTweening(target, propType);
        }
        static kill(target, complete, propType) {
            fgui.TweenManager.killTweens(target, complete, propType);
        }
        static getTween(target, propType) {
            return fgui.TweenManager.getTween(target, propType);
        }
    }
    GTween.catchCallbackExceptions = true;
    fgui.GTween = GTween;
})(fgui || (fgui = {}));

(function (fgui) {
    class GTweener {
        constructor() {
            this._startValue = new fgui.TweenValue();
            this._endValue = new fgui.TweenValue();
            this._value = new fgui.TweenValue();
            this._deltaValue = new fgui.TweenValue();
            this._reset();
        }
        setDelay(value) {
            this._delay = value;
            return this;
        }
        get delay() {
            return this._delay;
        }
        setDuration(value) {
            this._duration = value;
            return this;
        }
        get duration() {
            return this._duration;
        }
        setBreakpoint(value) {
            this._breakpoint = value;
            return this;
        }
        setEase(value) {
            this._easeType = value;
            return this;
        }
        setEasePeriod(value) {
            this._easePeriod = value;
            return this;
        }
        setEaseOvershootOrAmplitude(value) {
            this._easeOvershootOrAmplitude = value;
            return this;
        }
        setRepeat(repeat, yoyo = false) {
            this._repeat = repeat;
            this._yoyo = yoyo;
            return this;
        }
        get repeat() {
            return this._repeat;
        }
        setTimeScale(value) {
            this._timeScale = value;
            return this;
        }
        setSnapping(value) {
            this._snapping = value;
            return this;
        }
        setTarget(value, propType) {
            this._target = value;
            this._propType = propType;
            return this;
        }
        get target() {
            return this._target;
        }
        setPath(value) {
            this._path = value;
            return this;
        }
        setUserData(value) {
            this._userData = value;
            return this;
        }
        get userData() {
            return this._userData;
        }
        onUpdate(callback, caller) {
            this._onUpdate = callback;
            this._onUpdateCaller = caller;
            return this;
        }
        onStart(callback, caller) {
            this._onStart = callback;
            this._onStartCaller = caller;
            return this;
        }
        onComplete(callback, caller) {
            this._onComplete = callback;
            this._onCompleteCaller = caller;
            return this;
        }
        get startValue() {
            return this._startValue;
        }
        get endValue() {
            return this._endValue;
        }
        get value() {
            return this._value;
        }
        get deltaValue() {
            return this._deltaValue;
        }
        get normalizedTime() {
            return this._normalizedTime;
        }
        get completed() {
            return this._ended != 0;
        }
        get allCompleted() {
            return this._ended == 1;
        }
        setPaused(paused) {
            this._paused = paused;
            return this;
        }
        seek(time) {
            if (this._killed)
                return;
            this._elapsedTime = time;
            if (this._elapsedTime < this._delay) {
                if (this._started)
                    this._elapsedTime = this._delay;
                else
                    return;
            }
            this.update();
        }
        kill(complete) {
            if (this._killed)
                return;
            if (complete) {
                if (this._ended == 0) {
                    if (this._breakpoint >= 0)
                        this._elapsedTime = this._delay + this._breakpoint;
                    else if (this._repeat >= 0)
                        this._elapsedTime = this._delay + this._duration * (this._repeat + 1);
                    else
                        this._elapsedTime = this._delay + this._duration * 2;
                    this.update();
                }
                this.callCompleteCallback();
            }
            this._killed = true;
        }
        _to(start, end, duration) {
            this._valueSize = 1;
            this._startValue.x = start;
            this._endValue.x = end;
            this._value.x = start;
            this._duration = duration;
            return this;
        }
        _to2(start, start2, end, end2, duration) {
            this._valueSize = 2;
            this._startValue.x = start;
            this._endValue.x = end;
            this._startValue.y = start2;
            this._endValue.y = end2;
            this._value.x = start;
            this._value.y = start2;
            this._duration = duration;
            return this;
        }
        _to3(start, start2, start3, end, end2, end3, duration) {
            this._valueSize = 3;
            this._startValue.x = start;
            this._endValue.x = end;
            this._startValue.y = start2;
            this._endValue.y = end2;
            this._startValue.z = start3;
            this._endValue.z = end3;
            this._value.x = start;
            this._value.y = start2;
            this._value.z = start3;
            this._duration = duration;
            return this;
        }
        _to4(start, start2, start3, start4, end, end2, end3, end4, duration) {
            this._valueSize = 4;
            this._startValue.x = start;
            this._endValue.x = end;
            this._startValue.y = start2;
            this._endValue.y = end2;
            this._startValue.z = start3;
            this._endValue.z = end3;
            this._startValue.w = start4;
            this._endValue.w = end4;
            this._value.x = start;
            this._value.y = start2;
            this._value.z = start3;
            this._value.w = start4;
            this._duration = duration;
            return this;
        }
        _toColor(start, end, duration) {
            this._valueSize = 4;
            this._startValue.color = start;
            this._endValue.color = end;
            this._value.color = start;
            this._duration = duration;
            return this;
        }
        _shake(startX, startY, amplitude, duration) {
            this._valueSize = 5;
            this._startValue.x = startX;
            this._startValue.y = startY;
            this._startValue.w = amplitude;
            this._duration = duration;
            return this;
        }
        _init() {
            this._delay = 0;
            this._duration = 0;
            this._breakpoint = -1;
            this._easeType = fgui.EaseType.QuadOut;
            this._timeScale = 1;
            this._easePeriod = 0;
            this._easeOvershootOrAmplitude = 1.70158;
            this._snapping = false;
            this._repeat = 0;
            this._yoyo = false;
            this._valueSize = 0;
            this._started = false;
            this._paused = false;
            this._killed = false;
            this._elapsedTime = 0;
            this._normalizedTime = 0;
            this._ended = 0;
        }
        _reset() {
            this._target = null;
            this._userData = null;
            this._path = null;
            this._onStart = this._onUpdate = this._onComplete = null;
            this._onStartCaller = this._onUpdateCaller = this._onCompleteCaller = null;
        }
        _update(dt) {
            if (this._timeScale != 1)
                dt *= this._timeScale;
            if (dt == 0)
                return;
            if (this._ended != 0) {
                this.callCompleteCallback();
                this._killed = true;
                return;
            }
            this._elapsedTime += dt;
            this.update();
            if (this._ended != 0) {
                if (!this._killed) {
                    this.callCompleteCallback();
                    this._killed = true;
                }
            }
        }
        update() {
            this._ended = 0;
            if (this._valueSize == 0) {
                if (this._elapsedTime >= this._delay + this._duration)
                    this._ended = 1;
                return;
            }
            if (!this._started) {
                if (this._elapsedTime < this._delay)
                    return;
                this._started = true;
                this.callStartCallback();
                if (this._killed)
                    return;
            }
            var reversed = false;
            var tt = this._elapsedTime - this._delay;
            if (this._breakpoint >= 0 && tt >= this._breakpoint) {
                tt = this._breakpoint;
                this._ended = 2;
            }
            if (this._repeat != 0) {
                var round = Math.floor(tt / this._duration);
                tt -= this._duration * round;
                if (this._yoyo)
                    reversed = round % 2 == 1;
                if (this._repeat > 0 && this._repeat - round < 0) {
                    if (this._yoyo)
                        reversed = this._repeat % 2 == 1;
                    tt = this._duration;
                    this._ended = 1;
                }
            }
            else if (tt >= this._duration) {
                tt = this._duration;
                this._ended = 1;
            }
            this._normalizedTime = fgui.EaseManager.evaluate(this._easeType, reversed ? (this._duration - tt) : tt, this._duration, this._easeOvershootOrAmplitude, this._easePeriod);
            this._value.setZero();
            this._deltaValue.setZero();
            if (this._valueSize == 5) {
                if (this._ended == 0) {
                    var r = this._startValue.w * (1 - this._normalizedTime);
                    var rx = r * (Math.random() > 0.5 ? 1 : -1);
                    var ry = r * (Math.random() > 0.5 ? 1 : -1);
                    this._deltaValue.x = rx;
                    this._deltaValue.y = ry;
                    this._value.x = this._startValue.x + rx;
                    this._value.y = this._startValue.y + ry;
                }
                else {
                    this._value.x = this._startValue.x;
                    this._value.y = this._startValue.y;
                }
            }
            else if (this._path) {
                var pt = GTweener.helperPoint;
                this._path.getPointAt(this._normalizedTime, pt);
                if (this._snapping) {
                    pt.x = Math.round(pt.x);
                    pt.y = Math.round(pt.y);
                }
                this._deltaValue.x = pt.x - this._value.x;
                this._deltaValue.y = pt.y - this._value.y;
                this._value.x = pt.x;
                this._value.y = pt.y;
            }
            else {
                for (var i = 0; i < this._valueSize; i++) {
                    var n1 = this._startValue.getField(i);
                    var n2 = this._endValue.getField(i);
                    var f = n1 + (n2 - n1) * this._normalizedTime;
                    if (this._snapping)
                        f = Math.round(f);
                    this._deltaValue.setField(i, f - this._value.getField(i));
                    this._value.setField(i, f);
                }
            }
            if (this._target != null && this._propType) {
                if (this._propType instanceof Function) {
                    switch (this._valueSize) {
                        case 1:
                            this._propType.call(this._target, this._value.x);
                            break;
                        case 2:
                            this._propType.call(this._target, this._value.x, this._value.y);
                            break;
                        case 3:
                            this._propType.call(this._target, this._value.x, this._value.y, this._value.z);
                            break;
                        case 4:
                            this._propType.call(this._target, this._value.x, this._value.y, this._value.z, this._value.w);
                            break;
                        case 5:
                            this._propType.call(this._target, this._value.color);
                            break;
                        case 6:
                            this._propType.call(this._target, this._value.x, this._value.y);
                            break;
                    }
                }
                else {
                    if (this._valueSize == 5)
                        this._target[this._propType] = this._value.color;
                    else
                        this._target[this._propType] = this._value.x;
                }
            }
            this.callUpdateCallback();
        }
        callStartCallback() {
            if (this._onStart != null) {
                try {
                    this._onStart.call(this._onStartCaller, this);
                }
                catch (err) {
                    console.log("FairyGUI: error in start callback > " + err);
                }
            }
        }
        callUpdateCallback() {
            if (this._onUpdate != null) {
                try {
                    this._onUpdate.call(this._onUpdateCaller, this);
                }
                catch (err) {
                    console.log("FairyGUI: error in update callback > " + err);
                }
            }
        }
        callCompleteCallback() {
            if (this._onComplete != null) {
                try {
                    this._onComplete.call(this._onCompleteCaller, this);
                }
                catch (err) {
                    console.log("FairyGUI: error in complete callback > " + err);
                }
            }
        }
    }
    GTweener.helperPoint = new Laya.Point();
    fgui.GTweener = GTweener;
})(fgui || (fgui = {}));

(function (fgui) {
    class TweenManager {
        static createTween() {
            if (!TweenManager._inited) {
                Laya.timer.frameLoop(1, null, TweenManager.update);
                TweenManager._inited = true;
            }
            var tweener;
            var cnt = TweenManager._tweenerPool.length;
            if (cnt > 0) {
                tweener = TweenManager._tweenerPool.pop();
            }
            else
                tweener = new fgui.GTweener();
            tweener._init();
            TweenManager._activeTweens[TweenManager._totalActiveTweens++] = tweener;
            return tweener;
        }
        static isTweening(target, propType) {
            if (target == null)
                return false;
            var anyType = !propType;
            for (var i = 0; i < TweenManager._totalActiveTweens; i++) {
                var tweener = TweenManager._activeTweens[i];
                if (tweener != null && tweener.target == target && !tweener._killed
                    && (anyType || tweener._propType == propType))
                    return true;
            }
            return false;
        }
        static killTweens(target, completed, propType) {
            if (target == null)
                return false;
            var flag = false;
            var cnt = TweenManager._totalActiveTweens;
            var anyType = !propType;
            for (var i = 0; i < cnt; i++) {
                var tweener = TweenManager._activeTweens[i];
                if (tweener != null && tweener.target == target && !tweener._killed
                    && (anyType || tweener._propType == propType)) {
                    tweener.kill(completed);
                    flag = true;
                }
            }
            return flag;
        }
        static getTween(target, propType) {
            if (target == null)
                return null;
            var cnt = TweenManager._totalActiveTweens;
            var anyType = !propType;
            for (var i = 0; i < cnt; i++) {
                var tweener = TweenManager._activeTweens[i];
                if (tweener != null && tweener.target == target && !tweener._killed
                    && (anyType || tweener._propType == propType)) {
                    return tweener;
                }
            }
            return null;
        }
        static update() {
            var dt = Laya.timer.delta / 1000;
            var cnt = TweenManager._totalActiveTweens;
            var freePosStart = -1;
            for (var i = 0; i < cnt; i++) {
                var tweener = TweenManager._activeTweens[i];
                if (tweener == null) {
                    if (freePosStart == -1)
                        freePosStart = i;
                }
                else if (tweener._killed) {
                    tweener._reset();
                    TweenManager._tweenerPool.push(tweener);
                    TweenManager._activeTweens[i] = null;
                    if (freePosStart == -1)
                        freePosStart = i;
                }
                else {
                    if ((tweener._target instanceof fgui.GObject) && (tweener._target).isDisposed)
                        tweener._killed = true;
                    else if (!tweener._paused)
                        tweener._update(dt);
                    if (freePosStart != -1) {
                        TweenManager._activeTweens[freePosStart] = tweener;
                        TweenManager._activeTweens[i] = null;
                        freePosStart++;
                    }
                }
            }
            if (freePosStart >= 0) {
                if (TweenManager._totalActiveTweens != cnt) {
                    var j = cnt;
                    cnt = TweenManager._totalActiveTweens - cnt;
                    for (i = 0; i < cnt; i++)
                        TweenManager._activeTweens[freePosStart++] = TweenManager._activeTweens[j++];
                }
                TweenManager._totalActiveTweens = freePosStart;
            }
        }
    }
    TweenManager._activeTweens = new Array();
    TweenManager._tweenerPool = [];
    TweenManager._totalActiveTweens = 0;
    TweenManager._inited = false;
    fgui.TweenManager = TweenManager;
})(fgui || (fgui = {}));

(function (fgui) {
    class TweenValue {
        constructor() {
            this.x = this.y = this.z = this.w = 0;
        }
        get color() {
            return (this.w << 24) + (this.x << 16) + (this.y << 8) + this.z;
        }
        set color(value) {
            this.x = (value & 0xFF0000) >> 16;
            this.y = (value & 0x00FF00) >> 8;
            this.z = (value & 0x0000FF);
            this.w = (value & 0xFF000000) >> 24;
        }
        getField(index) {
            switch (index) {
                case 0:
                    return this.x;
                case 1:
                    return this.y;
                case 2:
                    return this.z;
                case 3:
                    return this.w;
                default:
                    throw new Error("Index out of bounds: " + index);
            }
        }
        setField(index, value) {
            switch (index) {
                case 0:
                    this.x = value;
                    break;
                case 1:
                    this.y = value;
                    break;
                case 2:
                    this.z = value;
                    break;
                case 3:
                    this.w = value;
                    break;
                default:
                    throw new Error("Index out of bounds: " + index);
            }
        }
        setZero() {
            this.x = this.y = this.z = this.w = 0;
        }
    }
    fgui.TweenValue = TweenValue;
})(fgui || (fgui = {}));

(function (fgui) {
    class ByteBuffer extends Laya.Byte {
        constructor(data = null, offset = 0, length = -1) {
            if (length == -1)
                length = data.byteLength - offset;
            if (offset == 0 && length == data.byteLength)
                super(data);
            else {
                super();
                this._u8d_ = new Uint8Array(data, offset, length);
                this._d_ = new DataView(this._u8d_.buffer, offset, length);
                this._length = length;
            }
            this.endian = Laya.Byte.BIG_ENDIAN;
        }
        skip(count) {
            this.pos += count;
        }
        readBool() {
            return this.getUint8() == 1;
        }
        readS() {
            var index = this.getUint16();
            if (index == 65534)
                return null;
            else if (index == 65533)
                return "";
            else
                return this.stringTable[index];
        }
        readSArray(cnt) {
            var ret = new Array(cnt);
            for (var i = 0; i < cnt; i++)
                ret[i] = this.readS();
            return ret;
        }
        writeS(value) {
            var index = this.getUint16();
            if (index != 65534 && index != 65533)
                this.stringTable[index] = value;
        }
        readColor(hasAlpha = false) {
            var r = this.getUint8();
            var g = this.getUint8();
            var b = this.getUint8();
            var a = this.getUint8();
            return (hasAlpha ? (a << 24) : 0) + (r << 16) + (g << 8) + b;
        }
        readColorS(hasAlpha = false) {
            var r = this.getUint8();
            var g = this.getUint8();
            var b = this.getUint8();
            var a = this.getUint8();
            if (hasAlpha && a != 255)
                return "rgba(" + r + "," + g + "," + b + "," + (a / 255) + ")";
            else {
                var sr = r.toString(16);
                var sg = g.toString(16);
                var sb = b.toString(16);
                if (sr.length == 1)
                    sr = "0" + sr;
                if (sg.length == 1)
                    sg = "0" + sg;
                if (sb.length == 1)
                    sb = "0" + sb;
                return "#" + sr + sg + sb;
            }
        }
        readChar() {
            var i = this.getUint16();
            return String.fromCharCode(i);
        }
        readBuffer() {
            var count = this.getUint32();
            var ba = new ByteBuffer(this.buffer, this._pos_, count);
            ba.stringTable = this.stringTable;
            ba.version = this.version;
            return ba;
        }
        seek(indexTablePos, blockIndex) {
            var tmp = this._pos_;
            this.pos = indexTablePos;
            var segCount = this.getUint8();
            if (blockIndex < segCount) {
                var useShort = this.getUint8() == 1;
                var newPos;
                if (useShort) {
                    this.pos += 2 * blockIndex;
                    newPos = this.getUint16();
                }
                else {
                    this.pos += 4 * blockIndex;
                    newPos = this.getUint32();
                }
                if (newPos > 0) {
                    this.pos = indexTablePos + newPos;
                    return true;
                }
                else {
                    this.pos = tmp;
                    return false;
                }
            }
            else {
                this.pos = tmp;
                return false;
            }
        }
    }
    fgui.ByteBuffer = ByteBuffer;
})(fgui || (fgui = {}));

(function (fgui) {
    let _func = Laya.HitArea["_isHitGraphic"];
    class ChildHitArea extends Laya.HitArea {
        constructor(child, reversed) {
            super();
            this._child = child;
            this._reversed = reversed;
            if (this._reversed)
                this.unHit = child.hitArea.hit;
            else
                this.hit = child.hitArea.hit;
        }
        contains(x, y) {
            var tPos;
            tPos = Laya.Point.TEMP;
            tPos.setTo(0, 0);
            tPos = this._child.toParentPoint(tPos);
            if (this._reversed)
                return !_func(x - tPos.x, y - tPos.y, this.unHit);
            else
                return _func(x - tPos.x, y - tPos.y, this.hit);
        }
    }
    fgui.ChildHitArea = ChildHitArea;
})(fgui || (fgui = {}));

(function (fgui) {
    class ColorMatrix {
        constructor() {
            this.matrix = new Array(ColorMatrix.LENGTH);
            this.reset();
        }
        static create(p_brightness, p_contrast, p_saturation, p_hue) {
            var ret = new ColorMatrix();
            ret.adjustColor(p_brightness, p_contrast, p_saturation, p_hue);
            return ret;
        }
        static getMatrix(p_brightness, p_contrast, p_saturation, p_hue, result) {
            if (!result)
                result = new Array(ColorMatrix.length);
            let mat = ColorMatrix.helper;
            mat.reset();
            mat.adjustColor(p_brightness, p_contrast, p_saturation, p_hue);
            var l = ColorMatrix.LENGTH;
            for (var i = 0; i < l; i++) {
                result[i] = mat.matrix[i];
            }
            return result;
        }
        reset() {
            for (var i = 0; i < ColorMatrix.LENGTH; i++) {
                this.matrix[i] = ColorMatrix.IDENTITY_MATRIX[i];
            }
        }
        invert() {
            this.multiplyMatrix([-1, 0, 0, 0, 255,
                0, -1, 0, 0, 255,
                0, 0, -1, 0, 255,
                0, 0, 0, 1, 0]);
        }
        adjustColor(p_brightness, p_contrast, p_saturation, p_hue) {
            this.adjustBrightness(p_brightness);
            this.adjustContrast(p_contrast);
            this.adjustSaturation(p_saturation);
            this.adjustHue(p_hue);
        }
        adjustBrightness(p_val) {
            p_val = this.cleanValue(p_val, 1) * 255;
            this.multiplyMatrix([
                1, 0, 0, 0, p_val,
                0, 1, 0, 0, p_val,
                0, 0, 1, 0, p_val,
                0, 0, 0, 1, 0
            ]);
        }
        adjustContrast(p_val) {
            p_val = this.cleanValue(p_val, 1);
            var s = p_val + 1;
            var o = 128 * (1 - s);
            this.multiplyMatrix([
                s, 0, 0, 0, o,
                0, s, 0, 0, o,
                0, 0, s, 0, o,
                0, 0, 0, 1, 0
            ]);
        }
        adjustSaturation(p_val) {
            p_val = this.cleanValue(p_val, 1);
            p_val += 1;
            var invSat = 1 - p_val;
            var invLumR = invSat * ColorMatrix.LUMA_R;
            var invLumG = invSat * ColorMatrix.LUMA_G;
            var invLumB = invSat * ColorMatrix.LUMA_B;
            this.multiplyMatrix([
                (invLumR + p_val), invLumG, invLumB, 0, 0,
                invLumR, (invLumG + p_val), invLumB, 0, 0,
                invLumR, invLumG, (invLumB + p_val), 0, 0,
                0, 0, 0, 1, 0
            ]);
        }
        adjustHue(p_val) {
            p_val = this.cleanValue(p_val, 1);
            p_val *= Math.PI;
            var cos = Math.cos(p_val);
            var sin = Math.sin(p_val);
            this.multiplyMatrix([
                ((ColorMatrix.LUMA_R + (cos * (1 - ColorMatrix.LUMA_R))) + (sin * -(ColorMatrix.LUMA_R))), ((ColorMatrix.LUMA_G + (cos * -(ColorMatrix.LUMA_G))) + (sin * -(ColorMatrix.LUMA_G))), ((ColorMatrix.LUMA_B + (cos * -(ColorMatrix.LUMA_B))) + (sin * (1 - ColorMatrix.LUMA_B))), 0, 0,
                ((ColorMatrix.LUMA_R + (cos * -(ColorMatrix.LUMA_R))) + (sin * 0.143)), ((ColorMatrix.LUMA_G + (cos * (1 - ColorMatrix.LUMA_G))) + (sin * 0.14)), ((ColorMatrix.LUMA_B + (cos * -(ColorMatrix.LUMA_B))) + (sin * -0.283)), 0, 0,
                ((ColorMatrix.LUMA_R + (cos * -(ColorMatrix.LUMA_R))) + (sin * -((1 - ColorMatrix.LUMA_R)))), ((ColorMatrix.LUMA_G + (cos * -(ColorMatrix.LUMA_G))) + (sin * ColorMatrix.LUMA_G)), ((ColorMatrix.LUMA_B + (cos * (1 - ColorMatrix.LUMA_B))) + (sin * ColorMatrix.LUMA_B)), 0, 0,
                0, 0, 0, 1, 0
            ]);
        }
        concat(p_matrix) {
            if (p_matrix.length != ColorMatrix.LENGTH) {
                return;
            }
            this.multiplyMatrix(p_matrix);
        }
        clone() {
            var result = new ColorMatrix();
            result.copyMatrix(this.matrix);
            return result;
        }
        copyMatrix(p_matrix) {
            var l = ColorMatrix.LENGTH;
            for (var i = 0; i < l; i++) {
                this.matrix[i] = p_matrix[i];
            }
        }
        multiplyMatrix(p_matrix) {
            var col = [];
            var i = 0;
            for (var y = 0; y < 4; ++y) {
                for (var x = 0; x < 5; ++x) {
                    col[i + x] = p_matrix[i] * this.matrix[x] +
                        p_matrix[i + 1] * this.matrix[x + 5] +
                        p_matrix[i + 2] * this.matrix[x + 10] +
                        p_matrix[i + 3] * this.matrix[x + 15] +
                        (x == 4 ? p_matrix[i + 4] : 0);
                }
                i += 5;
            }
            this.copyMatrix(col);
        }
        cleanValue(p_val, p_limit) {
            return Math.min(p_limit, Math.max(-p_limit, p_val));
        }
    }
    ColorMatrix.IDENTITY_MATRIX = [
        1, 0, 0, 0, 0,
        0, 1, 0, 0, 0,
        0, 0, 1, 0, 0,
        0, 0, 0, 1, 0
    ];
    ColorMatrix.LENGTH = ColorMatrix.IDENTITY_MATRIX.length;
    ColorMatrix.LUMA_R = 0.299;
    ColorMatrix.LUMA_G = 0.587;
    ColorMatrix.LUMA_B = 0.114;
    ColorMatrix.helper = new ColorMatrix();
    fgui.ColorMatrix = ColorMatrix;
})(fgui || (fgui = {}));

(function (fgui) {
    class PixelHitTest extends Laya.HitArea {
        constructor(data, offsetX = 0, offsetY = 0) {
            super();
            this._data = data;
            this.offsetX = offsetX;
            this.offsetY = offsetY;
            this.scaleX = 1;
            this.scaleY = 1;
        }
        contains(x, y) {
            x = Math.floor((x / this.scaleX - this.offsetX) * this._data.scale);
            y = Math.floor((y / this.scaleY - this.offsetY) * this._data.scale);
            if (x < 0 || y < 0 || x >= this._data.pixelWidth)
                return false;
            var pos = y * this._data.pixelWidth + x;
            var pos2 = Math.floor(pos / 8);
            var pos3 = pos % 8;
            if (pos2 >= 0 && pos2 < this._data.pixels.length)
                return ((this._data.pixels[pos2] >> pos3) & 0x1) == 1;
            else
                return false;
        }
    }
    fgui.PixelHitTest = PixelHitTest;
    class PixelHitTestData {
        constructor() {
        }
        load(ba) {
            ba.getInt32();
            this.pixelWidth = ba.getInt32();
            this.scale = 1 / ba.readByte();
            var len = ba.getInt32();
            this.pixels = [];
            for (var i = 0; i < len; i++) {
                var j = ba.readByte();
                if (j < 0)
                    j += 256;
                this.pixels[i] = j;
            }
        }
    }
    fgui.PixelHitTestData = PixelHitTestData;
})(fgui || (fgui = {}));

(function (fgui) {
    class UBBParser {
        constructor() {
            this._readPos = 0;
            this.defaultImgWidth = 0;
            this.defaultImgHeight = 0;
            this._handlers = {};
            this._handlers["url"] = this.onTag_URL;
            this._handlers["img"] = this.onTag_IMG;
            this._handlers["b"] = this.onTag_B;
            this._handlers["i"] = this.onTag_I;
            this._handlers["u"] = this.onTag_U;
            this._handlers["sup"] = this.onTag_Simple;
            this._handlers["sub"] = this.onTag_Simple;
            this._handlers["color"] = this.onTag_COLOR;
            this._handlers["font"] = this.onTag_FONT;
            this._handlers["size"] = this.onTag_SIZE;
        }
        onTag_URL(tagName, end, attr) {
            if (!end) {
                if (attr != null)
                    return "<a href=\"" + attr + "\" target=\"_blank\">";
                else {
                    var href = this.getTagText();
                    return "<a href=\"" + href + "\" target=\"_blank\">";
                }
            }
            else
                return "</a>";
        }
        onTag_IMG(tagName, end, attr) {
            if (!end) {
                var src = this.getTagText(true);
                if (!src)
                    return null;
                if (this.defaultImgWidth)
                    return "<img src=\"" + src + "\" width=\"" + this.defaultImgWidth + "\" height=\"" + this.defaultImgHeight + "\"/>";
                else
                    return "<img src=\"" + src + "\"/>";
            }
            else
                return null;
        }
        onTag_B(tagName, end, attr) {
            return end ? ("</span>") : ("<span style='font-weight:bold'>");
        }
        onTag_I(tagName, end, attr) {
            return end ? ("</span>") : ("<span style='font-style:italic'>");
        }
        onTag_U(tagName, end, attr) {
            return end ? ("</span>") : ("<span style='text-decoration:underline'>");
        }
        onTag_Simple(tagName, end, attr) {
            return end ? ("</" + tagName + ">") : ("<" + tagName + ">");
        }
        onTag_COLOR(tagName, end, attr) {
            if (!end) {
                this.lastColor = attr;
                return "<span style=\"color:" + attr + "\">";
            }
            else
                return "</span>";
        }
        onTag_FONT(tagName, end, attr) {
            if (!end)
                return "<span style=\"font-family:" + attr + "\">";
            else
                return "</span>";
        }
        onTag_SIZE(tagName, end, attr) {
            if (!end) {
                this.lastSize = attr;
                return "<span style=\"font-size:" + attr + "\">";
            }
            else
                return "</span>";
        }
        getTagText(remove = false) {
            var pos1 = this._readPos;
            var pos2;
            var result = "";
            while ((pos2 = this._text.indexOf("[", pos1)) != -1) {
                if (this._text.charCodeAt(pos2 - 1) == 92) {
                    result += this._text.substring(pos1, pos2 - 1);
                    result += "[";
                    pos1 = pos2 + 1;
                }
                else {
                    result += this._text.substring(pos1, pos2);
                    break;
                }
            }
            if (pos2 == -1)
                return null;
            if (remove)
                this._readPos = pos2;
            return result;
        }
        parse(text, remove = false) {
            this._text = text;
            this.lastColor = null;
            this.lastSize = null;
            var pos1 = 0, pos2, pos3;
            var end;
            var tag, attr;
            var repl;
            var func;
            var result = "";
            while ((pos2 = this._text.indexOf("[", pos1)) != -1) {
                if (pos2 > 0 && this._text.charCodeAt(pos2 - 1) == 92) {
                    result += this._text.substring(pos1, pos2 - 1);
                    result += "[";
                    pos1 = pos2 + 1;
                    continue;
                }
                result += this._text.substring(pos1, pos2);
                pos1 = pos2;
                pos2 = this._text.indexOf("]", pos1);
                if (pos2 == -1)
                    break;
                end = this._text.charAt(pos1 + 1) == '/';
                tag = this._text.substring(end ? pos1 + 2 : pos1 + 1, pos2);
                this._readPos = pos2 + 1;
                attr = null;
                repl = null;
                pos3 = tag.indexOf("=");
                if (pos3 != -1) {
                    attr = tag.substring(pos3 + 1);
                    tag = tag.substring(0, pos3);
                }
                tag = tag.toLowerCase();
                func = this._handlers[tag];
                if (func != null) {
                    if (!remove) {
                        repl = func.call(this, tag, end, attr);
                        if (repl != null)
                            result += repl;
                    }
                }
                else
                    result += this._text.substring(pos1, this._readPos);
                pos1 = this._readPos;
            }
            if (pos1 < this._text.length)
                result += this._text.substr(pos1);
            this._text = null;
            return result;
        }
    }
    UBBParser.inst = new UBBParser();
    fgui.UBBParser = UBBParser;
})(fgui || (fgui = {}));

(function (fgui) {
    class ToolSet {
        static getFileName(source) {
            var i = source.lastIndexOf("/");
            if (i != -1)
                source = source.substr(i + 1);
            i = source.lastIndexOf("\\");
            if (i != -1)
                source = source.substr(i + 1);
            i = source.lastIndexOf(".");
            if (i != -1)
                return source.substring(0, i);
            else
                return source;
        }
        static startsWith(source, str, ignoreCase = false) {
            if (!source)
                return false;
            else if (source.length < str.length)
                return false;
            else {
                source = source.substring(0, str.length);
                if (!ignoreCase)
                    return source == str;
                else
                    return source.toLowerCase() == str.toLowerCase();
            }
        }
        static endsWith(source, str, ignoreCase = false) {
            if (!source)
                return false;
            else if (source.length < str.length)
                return false;
            else {
                source = source.substring(source.length - str.length);
                if (!ignoreCase)
                    return source == str;
                else
                    return source.toLowerCase() == str.toLowerCase();
            }
        }
        static trim(targetString) {
            return ToolSet.trimLeft(ToolSet.trimRight(targetString));
        }
        static trimLeft(targetString) {
            var tempChar = "";
            for (var i = 0; i < targetString.length; i++) {
                tempChar = targetString.charAt(i);
                if (tempChar != " " && tempChar != "\n" && tempChar != "\r") {
                    break;
                }
            }
            return targetString.substr(i);
        }
        static trimRight(targetString) {
            var tempChar = "";
            for (var i = targetString.length - 1; i >= 0; i--) {
                tempChar = targetString.charAt(i);
                if (tempChar != " " && tempChar != "\n" && tempChar != "\r") {
                    break;
                }
            }
            return targetString.substring(0, i + 1);
        }
        static convertToHtmlColor(argb, hasAlpha = false) {
            var alpha;
            if (hasAlpha)
                alpha = (argb >> 24 & 0xFF).toString(16);
            else
                alpha = "";
            var red = (argb >> 16 & 0xFF).toString(16);
            var green = (argb >> 8 & 0xFF).toString(16);
            var blue = (argb & 0xFF).toString(16);
            if (alpha.length == 1)
                alpha = "0" + alpha;
            if (red.length == 1)
                red = "0" + red;
            if (green.length == 1)
                green = "0" + green;
            if (blue.length == 1)
                blue = "0" + blue;
            return "#" + alpha + red + green + blue;
        }
        static convertFromHtmlColor(str, hasAlpha = false) {
            if (str.length < 1)
                return 0;
            if (str.charAt(0) == "#")
                str = str.substr(1);
            if (str.length == 8)
                return (parseInt(str.substr(0, 2), 16) << 24) + parseInt(str.substr(2), 16);
            else if (hasAlpha)
                return 0xFF000000 + parseInt(str, 16);
            else
                return parseInt(str, 16);
        }
        static displayObjectToGObject(obj) {
            while (obj != null && !(obj instanceof Laya.Stage)) {
                if (obj["$owner"])
                    return obj["$owner"];
                obj = obj.parent;
            }
            return null;
        }
        static encodeHTML(str) {
            if (!str)
                return "";
            else
                return str.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("'", "&apos;");
        }
        static parseUBB(text) {
            return ToolSet.defaultUBBParser.parse(text);
        }
        static removeUBB(text) {
            return ToolSet.defaultUBBParser.parse(text, true);
        }
        static clamp(value, min, max) {
            if (value < min)
                value = min;
            else if (value > max)
                value = max;
            return value;
        }
        static clamp01(value) {
            if (isNaN(value))
                value = 0;
            else if (value > 1)
                value = 1;
            else if (value < 0)
                value = 0;
            return value;
        }
        static lerp(start, end, percent) {
            return (start + percent * (end - start));
        }
        static repeat(t, length) {
            return t - Math.floor(t / length) * length;
        }
        static distance(x1, y1, x2, y2) {
            return Math.sqrt(Math.pow(x1 - x2, 2) + Math.pow(y1 - y2, 2));
        }
        static setColorFilter(obj, color) {
            var filter = obj.$_colorFilter_;
            var filters = obj.filters;
            var toApplyColor;
            var toApplyGray;
            var tp = typeof (color);
            if (tp == "boolean") {
                toApplyColor = filter ? filter.$_color_ : null;
                toApplyGray = color;
            }
            else {
                if (tp == "string") {
                    var arr = Laya.ColorUtils.create(color).arrColor;
                    if (arr[0] == 1 && arr[1] == 1 && arr[2] == 1)
                        color = null;
                    else {
                        color = [arr[0], 0, 0, 0, 0,
                            0, arr[1], 0, 0, 0,
                            0, 0, arr[2], 0, 0,
                            0, 0, 0, 1, 0];
                    }
                }
                toApplyColor = color;
                toApplyGray = filter ? filter.$_grayed_ : false;
            }
            if ((!toApplyColor && toApplyColor != 0) && !toApplyGray) {
                if (filters && filter) {
                    let i = filters.indexOf(filter);
                    if (i != -1) {
                        filters.splice(i, 1);
                        if (filters.length > 0)
                            obj.filters = filters;
                        else
                            obj.filters = null;
                    }
                }
                return;
            }
            if (!filter) {
                filter = new Laya.ColorFilter();
                obj.$_colorFilter_ = filter;
            }
            if (!filters)
                filters = [filter];
            else {
                let i = filters.indexOf(filter);
                if (i == -1)
                    filters.push(filter);
            }
            obj.filters = filters;
            filter.$_color_ = toApplyColor;
            filter.$_grayed_ = toApplyGray;
            filter.reset();
            if (toApplyGray)
                filter.gray();
            else if (toApplyColor.length == 20)
                filter.setByMatrix(toApplyColor);
            else
                filter.setByMatrix(fgui.ColorMatrix.getMatrix(toApplyColor[0], toApplyColor[1], toApplyColor[2], toApplyColor[3]));
        }
    }
    ToolSet.defaultUBBParser = new fgui.UBBParser();
    fgui.ToolSet = ToolSet;
})(fgui || (fgui = {}));
