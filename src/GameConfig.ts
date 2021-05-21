/**This class is automatically generated by LayaAirIDE, please do not make any modifications. */

import DatePicker from "./extension/DatePicker";
import Joystick from "./extension/Joystick";
import Scratch from "./extension/Scratch";

/*
* 游戏初始化配置;
*/
export default class GameConfig{
    static width:number=1720;
    static height:number=720;
    static scaleMode:string="fixedwidth";
    static screenMode:string="none";
    static alignV:string="top";
    static alignH:string="left";
    static startScene:any="";
    static sceneRoot:string="";
    static debug:boolean=false;
    static stat:boolean=false;
    static physicsDebug:boolean=false;
    static exportSceneToJson:boolean=true;
    constructor(){}
    static init(){
        fgui.UIObjectFactory.setExtension("ui://ScratchCard/scratch", Scratch);
        fgui.UIObjectFactory.setExtension("ui://DatePicker/datePicker", DatePicker);
        fgui.UIObjectFactory.setExtension("ui://MiniMap/joystick", Joystick);
    }
}
GameConfig.init();