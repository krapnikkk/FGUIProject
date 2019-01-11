import Handler = laya.utils.Handler;
class WindowB extends fairygui.Window{
    public constructor() {
        super();
    }
    
    protected onInit():void {        
        this.contentPane = fairygui.UIPackage.createObject("Basic", "WindowB").asCom;
        this.center();
        
        //弹出窗口的动效已中心为轴心
        this.setPivot(0.5, 0.5);
    }
    
    protected doShowAnimation():void
    {
        this.setScale(0.1, 0.1);
        laya.utils.Tween.to(this, { scaleX: 1,scaleY: 1 },300, laya.utils.Ease.quadOut, Handler.create(this, this.onShown));
    }
    
    protected doHideAnimation():void
    {
        laya.utils.Tween.to(this, { scaleX: 0.1,scaleY: 0.1 },300, laya.utils.Ease.quadOut, Handler.create(this, this.hideImmediately));
    }
    
    protected onShown():void
    {
        this.contentPane.getTransition("t1").play();	
    }
    
    protected onHide():void
    {
        this.contentPane.getTransition("t1").stop();
    }
}
