/*
* 游戏初始化配置;
*/
export default class GameConfig{
    static width:number=document.body.clientWidth;
    static height:number=document.body.clientHeight;
    static scaleMode:string="fixedwidth";
    static screenMode:string="none";
    // static startScene:string="test/TestScene.scene";
    static sceneRoot:string="";
    static debug:boolean=false;
    static stat:boolean=false;
    static physicsDebug:boolean=false;
    static exportSceneToJson:boolean=true;
    constructor(){}
    static init(){
        
    }
}
GameConfig.init();