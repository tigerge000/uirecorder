(function(){
    var isIframe = self !== top;
    var isRecording = false;
    var isStopEvent = false;
    var isBodyReady = false;
    var isOnload = false;

    // dom selector
    var divDomSelector = null;
    var lastSelectDom = null;
    var domSelectorCallback = null;
    var spanShowDomPath = null;
    var expectGetValueCallback = null;
    var lastAlertExpect = null;

    // 全局配置
    var configLoaded = false;
    var testVars = {};
    var arrPathAttrs = ['data-id', 'data-name', 'type', 'data-type', 'data-role', 'data-value'];
    var reAttrValueBlack = /^$/;
    var specLists = [];

    // i18n
    var i18n = {};
    var __ = function(str){
        var args = arguments;
        str = i18n[str] || str;
        var count = 0;
        str = str.replace(/%s/g, function(){
            count ++;
            return args[count] || '';
        });
        return str;
    };

    // 全局事件
    var mapGlobalEvents = {};
    var eventPort = chrome.extension.connect();
    var GlobalEvents = {
        on: function(type, handler){
            var arrEvents = mapGlobalEvents[type] || [];
            arrEvents.push(handler);
            mapGlobalEvents[type] = arrEvents;
        },
        emit: function(type, data){
            eventPort.postMessage({
                type: type,
                data: data
            });
        },
        _emit: function(type, data){
            var arrEvents = mapGlobalEvents[type] || [];
            arrEvents.forEach(function(handler){
                handler(data);
            });
        }
    };
    eventPort.onMessage.addListener(function(msg) {
        GlobalEvents._emit(msg.type, msg.data);
    });

    // load config
    chrome.runtime.sendMessage({
        type: 'getConfig'
    }, function(config){
        if(config.testVars){
            testVars = config.testVars;
        }
        var pathAttrs = config.pathAttrs;
        if(pathAttrs){
            pathAttrs = pathAttrs.replace(/^\s+|\s+$/g, '');
            arrPathAttrs = pathAttrs.split(/\s*,\s*/);
            arrPathAttrs.unshift('name');
        }
        var attrValueBlack = config.attrValueBlack;
        try{
            if(attrValueBlack){
                reAttrValueBlack = eval(attrValueBlack);
            }
        }
        catch(e){
            reAttrValueBlack = /^$/;
        }
        specLists = config.specLists;
        i18n = config.i18n;
        configLoaded = true;
        showToolPannel();
    });

    // 读取cookie
    function getCookie(name){
        var mapCookies = {};
        var cookie = document.cookie || '';
        cookie.replace(/([^=]+)\s*=\s*([^;]*)\s*;?\s*/g, function(all, name, value){
            mapCookies[name] = value;
        });
        return mapCookies[name];
    }

    var reHoverClass = /(^|[^a-z0-9])(on)?(hover|hovered|over|active|current|focus|focused)([^a-z0-9]|$)/i;

    // get selector path
    function getDomPath(target){
        var arrAllPaths = [];
        var node = target, path;
        while(node){
            var nodeName = node.nodeName.toLowerCase();
            if(/^#document/.test(nodeName)){
                path = getRelativeDomPath(node, target);
                if(path){
                    arrAllPaths.push(path);
                }
                node = node.parentNode || node.host;
                target = node;
            }
            else{
                node = node.parentNode || node.host;
            }
        }
        return arrAllPaths.length > 0 ? arrAllPaths.reverse().join(' /deep/ ') : null;
    }

    function getRelativeDomPath(rootNode, target){
        var relativePath = '';
        var tagName = target.nodeName.toLowerCase();
        var tempPath;
        var idValue = target.getAttribute && target.getAttribute('id');
        var nameValue = target.getAttribute && target.getAttribute('name');
        var typeValue = target.getAttribute && target.getAttribute('type');
        var valueValue = target.getAttribute && target.getAttribute('value');
        // 检查目标元素自身是否有唯一id
        if(idValue && reAttrValueBlack.test(idValue) === false && checkUniqueSelector(rootNode, '#'+idValue)){
            // id定位
            return '#'+idValue;
        }
        else if(tagName === 'input'){
            // 表单项特殊校验
            tempPath = nameValue ? tagName + '[name="'+nameValue+'"]' : tagName;
            switch(typeValue){
                case 'radio':
                case 'checkbox':
                    tempPath += '[value="'+valueValue+'"]';
                    break;
            }
            tempPath += (childPath ? ' > ' + childPath : '');
            if(checkUniqueSelector(rootNode, tempPath)){
                return tempPath;
            }
        }
        else if(nameValue){
            // 非input，但有name值
            tempPath = tagName + '[name="'+nameValue+'"]'
            if(tempPath && reAttrValueBlack.test(nameValue) === false && checkUniqueSelector(rootNode, tempPath)){
                return tempPath;
            }
        }
        else{
            // 检查目标是否有父容器有唯一id
            var idNodeInfo = getClosestIdNode(target);
            if(idNodeInfo){
                rootNode = idNodeInfo.node;
                relativePath = idNodeInfo.path + ' ';
            }
        }
        var current = target;
        var childPath = '';
        while(current !== null){
            if(current !== rootNode){
                childPath = getSelectorElement(current, rootNode, childPath);
                if(childPath.substr(0,1) === '!'){
                    return relativePath + childPath.substr(1);
                }
                current = current.parentNode;
            }
            else{
                current = null;
            }
        }
        return null;
    }
    // 读取最近的id唯一节点
    function getClosestIdNode(target){
        var current = target;
        var body = target.ownerDocument.body;
        while(current !== null){
            if(current.nodeName !== 'HTML'){
                var idValue = current.getAttribute && current.getAttribute('id');
                if(idValue && reAttrValueBlack.test(idValue) === false && checkUniqueSelector(body, '#'+idValue)){
                    return {
                        node: current,
                        path: '#'+idValue
                    };
                }
                current = current.parentNode;
            }
            else{
                current = null;
            }
        }
        return null;
    }
    // 获取节点CSS选择器
    function getSelectorElement(target, relativeNode, childPath){
        var tagName = target.nodeName.toLowerCase();
        var elementPath = tagName, tempPath;
        // 校验tagName是否能唯一定位
        tempPath = elementPath + (childPath ? ' > ' + childPath : '');
        if(checkUniqueSelector(relativeNode, tempPath)){
            return '!' + tempPath;
        }
        // 校验class能否定位
        var relativeClass = null;
        var classValue = target.getAttribute && target.getAttribute('class');
        if(classValue){
            var arrClass = classValue.split(/\s+/);
            for(var i in arrClass){
                var className = arrClass[i];
                if(className && reHoverClass.test(className) === false){
                    tempPath = elementPath + '.'+arrClass[i] + (childPath ? ' > ' + childPath : '');
                    if(checkUniqueSelector(relativeNode, tempPath)){
                        return '!' + tempPath;
                    }
                    else{
                        // 无法绝对定位,再次测试是否可以在父节点中相对定位自身
                        var parent = target.parentNode;
                        if(parent){
                            var element = parent.querySelectorAll('.'+className);
                            if(element.length === 1){
                                relativeClass = className;
                            }
                        }
                    }
                }
            }
        }
        // 校验属性是否能定位
        var attrName, attrValue;
        for(var i in arrPathAttrs){
            attrName = arrPathAttrs[i];
            attrValue = target.getAttribute && target.getAttribute(attrName);
            if(attrValue && reAttrValueBlack.test(attrValue) === false){
                elementPath += '['+attrName+'="'+attrValue+'"]';
                tempPath = elementPath + (childPath ? ' > ' + childPath : '');
                if(checkUniqueSelector(relativeNode, tempPath)){
                    return '!' + tempPath;
                }
            }
        }
        // 父元素定位
        if(relativeClass){
            elementPath += '.' + relativeClass;
        }
        else{
            var index = getChildIndex(target);
            if(index !== -1){
                elementPath += ':nth-child('+index+')';
            }
        }
        tempPath = elementPath + (childPath ? ' > ' + childPath : '');
        if(checkUniqueSelector(relativeNode, tempPath)){
            return '!' + tempPath;
        }
        return tempPath;
    }
    function curCSS(elem, name){
        var curStyle = elem.currentStyle;
        var style = elem.style;
        return (curStyle && curStyle[name]) || (style && style[name]);
    }
    function isHidden(elem){
        return ( elem.offsetWidth === 0 && elem.offsetHeight === 0 ) || (curCSS( elem, "display" ) === "none");
    }
    function checkUniqueSelector(relativeNode, path){
        try{
            var elements = relativeNode.querySelectorAll(path);
            var count = 0;
            for(var i=0;i<elements.length;i++){
                if(!isHidden(elements[i]))count ++;
            }
            return count === 1;
        }
        catch(e){return false;}
    }
    function getChildIndex(el){
        var index = -1;
        var parentNode = el.parentNode;
        if(parentNode){
            var childNodes = parentNode.childNodes;
            var total = 0;
            var node;
            for (var i = 0, len=childNodes.length; i < len; i++) {
                node = childNodes[i];
                if(node.nodeType === 1){
                    total++;
                    if ( node === el) {
                        index = total;
                    }
                }
            }
        }
        if(total === 1){
            index = -1;
        }
        return index;
    }

    function findDomPathElement(path){
        var elements = document.querySelectorAll(path);
        var newElements = [], element;
        for(var i=0;i<elements.length;i++){
            element = elements[i];
            if(!isHidden(element))newElements.push(element);
        }
        return newElements;
    }

    // get frame id
    function getFrameId(){
        var frame = -1;
        if(isIframe){
            try{
                var frameElement = window.frameElement;
                if(frameElement !== null){
                    frame = getDomPath(frameElement) || -1;
                }
                else{
                    frame = {
                        href: location.href.replace(/^https?:/,'')
                    };
                    var parentFrames = parent.frames;
                    for(var i=0,len=parentFrames.length;i<len;i++){
                        if(parentFrames[i] === window){
                            frame.id = i;
                            break;
                        }
                    }
                }
            }
            catch(e){}
        }
        else{
            frame = null;
        }
        return frame;
    }

    // save command
    function saveCommand(cmd, data){
        var frameId = getFrameId();
        var cmdData = {
            frame: frameId,
            cmd: cmd,
            data: data
        };
        if(typeof frameId === 'object'){
            parent.postMessage({
                type: 'uiRecorderFrameCommmand',
                data: cmdData
            }, '*');
        }
        else{
            chrome.runtime.sendMessage({
                type: 'command',
                data: cmdData
            });
            if(lastAlertExpect && cmdData.cmd === lastAlertExpect.params[0]){
                lastAlertExpect.params = [];
                chrome.runtime.sendMessage({
                    type: 'command',
                    data: {
                        cmd: 'expect',
                        frame: frameId,
                        data: lastAlertExpect
                    }
                });
                lastAlertExpect = null;
            }
        }
    }

    window.addEventListener('message', function(e){
        var data = e.data;
        var type = data && data.type;
        if(type === 'uiRecorderAlertCommand'){
            var cmdInfo = data.cmdInfo;
            saveCommand(cmdInfo.cmd, cmdInfo.data);
        }
        else if(type === 'uiRecorderFrameCommmand'){
            data = data.data;
            // fix frameId to path
            var frame = data.frame;
            var arrIframes, frameDom = null;
            if(frame){
                if(frame.id !== undefined){
                    var frameWindow = window.frames[frame.id];
                    arrIframes = document.getElementsByTagName("iframe");
                    for(var i =0, len = arrIframes.length;i<len;i++){
                        frameDom = arrIframes[i];
                        if(frameDom.contentWindow === frameWindow){
                            break;
                        }
                    }
                    data.frame = getDomPath(frameDom);
                }
                else{
                    arrIframes = document.querySelectorAll('* /deep/ iframe');
                    for(var i =0, len = arrIframes.length;i<len;i++){
                        frameDom = arrIframes[i];
                        if(frameDom.src.replace(/^https?:/,'') === frame.href){
                            break;
                        }
                    }
                    data.frame = getDomPath(frameDom);
                }
            }
            chrome.runtime.sendMessage({
                type: 'command',
                data: data
            });
        }
    }, true);

    function simulateMouseEvent(target, type, bubbles, cancelable, view, detail, screenX, screenY, clientX, clientY){
        try{
            var customEvent = document.createEvent("MouseEvents");
            customEvent.initMouseEvent(type, bubbles, cancelable, view, detail, screenX, screenY, clientX, clientY);
            target.dispatchEvent(customEvent);
        }
        catch(e){}
    }

    function simulateKeyboardEvent(target, type, keyCode, charCode){
        try{
            var customEvent = document.createEvent('KeyboardEvent');
            customEvent.initKeyEvent(type, false, true, null, false, false, false, false, keyCode, charCode);
            target.dispatchEvent(customEvent);
        }
        catch(e){}
    }

    function simulateInputEvent(target){
        try{
            var customEvent = document.createEvent('Event');
            customEvent.initEvent('input', true, true);
            target.dispatchEvent(customEvent);
        }
        catch(e){}
    }


    // 计算字节长度,中文两个字节
    function byteLen(text){
        var count = 0;
        for(var i=0,len=text.length;i<len;i++){
            char = text.charCodeAt(i);
            count += char > 255 ? 2 : 1;
        }
        return count;
    }

    // 从左边读取限制长度的字符串
    function leftstr(text, limit){
        var substr = '';
        var count = 0;
        var char;
        for(var i=0,len=text.length;i<len;i++){
            char = text.charCodeAt(i);
            substr += text.charAt(i);
            count += char > 255 ? 2 : 1;
            if(count >= limit){
                return substr;
            }
        }
        return substr;
    }

    function getTargetText(target){
        var nodeName = target.nodeName;
        var id = target.getAttribute('id');
        var text = '';
        if(nodeName === 'INPUT'){
            var type = target.getAttribute('type');
            switch(type){
                case 'button':
                case 'reset':
                case 'submit':
                    text = target.getAttribute('value');
                    break;
                default:
                    var parentNode = target.parentNode;
                    if(parentNode.nodeName === 'LABEL'){
                        text = parentNode.textContent;
                    }
                    else if(id){
                        var labelForElement = findDomPathElement('label[for="'+id+'"]');
                        if(labelForElement.length > 0){
                            text = labelForElement[0].textContent;
                        }
                        else{
                            text = target.getAttribute('name');
                        }
                    }
                    else{
                        text = target.getAttribute('name');
                    }
            }
        }
        else if(nodeName === 'SELECT'){
            text = target.getAttribute('name');
        }
        else{
            text = target.textContent;
        }
        text = text || '';
        text = text.replace(/\s*\r?\n\s*/g,' ');
        text = text.replace(/^\s+|\s+$/g, '');
        var textLen = byteLen(text);
        if(textLen <= 60){
            text = textLen > 20 ? leftstr(text, 20) + '...' : text;
        }
        else{
            text = '';
        }
        return text;
    }

    // 调整label为for的表单DOM,以增加PATH稳定性
    function getLabelTarget(target){
        var labelDom;
        if(target.nodeName !== 'INPUT'){
            if(target.nodeName === 'LABEL'){
                labelDom = target;
            }
            else if(target.parentNode.nodeName === 'LABEL'){
                labelDom = target.parentNode;
            }
        }
        if(labelDom){
            // label标签，替换为目标表单项
            var forValue = labelDom.getAttribute && labelDom.getAttribute('for');
            var labelTargets;
            if(forValue){
                // 有指定for
                labelTargets = findDomPathElement('#'+forValue);
                if(labelTargets.length === 1 && isDomVisible(labelTargets[0])){
                    return labelTargets[0];
                }
            }
            else{
                // 没有指定for
                labelTargets = labelDom.querySelectorAll('input');
                if(labelTargets.length === 1 && isDomVisible(labelTargets[0])){
                    return labelTargets[0];
                }
            }
        }
    }

    // 检测dom是否可见
    function isDomVisible(target){
        var offset = target.getBoundingClientRect();
        return offset.width > 0 && offset.height > 0;
    }

    // show loading
    var divLoading;
    function showLoading(){
        divLoading = document.createElement("div");
        divLoading.id = 'uirecorder-loading';
        divLoading.innerHTML = '<style>#uirecorder-loading{display:block;position:fixed;z-index:2147483647;left:0;top:0;width:100%;height:100%;}#uirecorder-loading div{z-index:0;background:#000;width:100%;height:100%;opacity:0.6}#uirecorder-loading span{z-index:1;position:fixed;top:50%;left:50%;margin-left:-80px;margin-top:-20px;color:white;font-size:30px;}</style><div></div><span>'+__('loading')+'</span>';
        document.body.appendChild(divLoading);
    }

    function onBodyReady(){
        if(isBodyReady === false){
            isBodyReady = true;
            hookAlert();
            showLoading();
        }
    }

    function onLoad(){
        onBodyReady();
        isOnload = true;
        if(isIframe === false){
            saveCommand('waitBody');
        }
        if(isIframe && location.href === 'about:blank'){
            // 富文本延后初始化
            setTimeout(showToolPannel, 500);
        }
        else{
            showToolPannel();
        }
    }

    function showToolPannel(){
        if(isOnload && configLoaded){
            initRecorderEvent();
            initRecorderDom();
            divLoading.style.display = 'none';
        }
    }

    function checkBodyReady(){
        var body = document.getElementsByTagName("body");
        if(body && body.length===1){
            onBodyReady();
        }
        else{
            setTimeout(checkBodyReady, 10);
        }
    }

    checkBodyReady();

    if(document.readyState === 'complete'){
        onLoad();
    }
    else{
        window.addEventListener('load', onLoad, true);
    }

    // 工作模式变更
    GlobalEvents.on('modeChange', function(mode){
        switch(mode){
            case 'record':
                removeSelector();
                isRecording = true;
                isStopEvent = false;
                break;
            case 'pauseAll':
                removeSelector();
                isRecording = false;
                isStopEvent = true;
                break;
            case 'pauseRecord':
                removeSelector();
                isRecording = false;
                isStopEvent = false;
                break;
            case 'select':
                initDomSelecter();
                isRecording = false;
                isStopEvent = true;
        }
    });
    // 设置全局工作模式
    function setGlobalWorkMode(mode){
        GlobalEvents.emit('modeChange', mode);
    }

    // dom选择器hover事件
    GlobalEvents.on('selecterHover', function(event){
        var frameId = getFrameId();
        if(frameId !== event.frame){
            // 清空选择器其余的iframe浮层
            divDomSelector.style.display = 'none';
        }
        if(isIframe === false){
            // 主窗口显示path路径
            spanShowDomPath.innerHTML = event.path;
        }
    });

    // 添加悬停命令
    GlobalEvents.on('addHover', function(event){
        var frameId = getFrameId();
        if(frameId === event.frame){
            var elements = findDomPathElement(event.path);
            if(elements.length === 1){
                var target = elements[0];
                GlobalEvents.emit('showDomPath', event.path);
                saveCommand('mouseMove', {
                    path: event.path,
                    text: getTargetText(target)
                });
                simulateMouseEvent(target, 'mouseover', true, true, null);
                simulateMouseEvent(target, 'mousemove', true, true, null, 1, event.screenX, event.screenY, event.clientX, event.clientY);
            }
        }
    });

    // 插入变量
    GlobalEvents.on('setVar', function(event){
        var frameId = getFrameId();
        if(frameId === event.frame){
            var path = event.path;
            var elements = findDomPathElement(path);
            if(elements.length === 1){
                var target = elements[0];
                target.focus();
                var varinfo = event.varinfo;
                target.value = varinfo.value;
                GlobalEvents.emit('showDomPath', path);
                saveCommand('setVar', {
                    path: path,
                    varinfo: varinfo,
                    text: getTargetText(target)
                });
                simulateKeyboardEvent(target, 'keyup', 20, 20);
                simulateInputEvent(target);
            }
        }
    });

    // 获取断言默认值
    GlobalEvents.on('getExpectValue', function(event){
        var domInfo = event.domInfo;
        var frameId = getFrameId();
        if(frameId === domInfo.frame){
            var path = domInfo.path;
            var elements = findDomPathElement(path);
            if(elements.length === 1){
                var expectTarget = elements[0];
                var type = event.type;
                var param = event.param;
                var expectValue = '';
                switch(type){
                    case 'val':
                        expectValue = expectTarget.value || '';
                        break;
                    case 'text':
                        var text = expectTarget.textContent || '';
                        text = text.replace(/^\s+|\s+$/g, '');
                        expectValue = text;
                        break;
                    case 'displayed':
                        expectValue = 'true';
                        break;
                    case 'enabled':
                        expectValue = expectTarget.disabled ? 'false' : 'true';
                        break;
                    case 'selected':
                        expectValue = expectTarget.checked ? 'true' : 'false';
                        break;
                    case 'attr':
                        if(param){
                            expectValue = expectTarget.getAttribute(param) || '';
                        }
                        break;
                    case 'css':
                        if(param){
                            var styles = window.getComputedStyle(expectTarget, null);
                            expectValue = styles.getPropertyValue(param) || '';
                        }
                        break;
                }
                GlobalEvents.emit('returnExpectValue', expectValue);
            }
        }
    });

    // 添加断言命令
    GlobalEvents.on('addExpect', function(event){
        var frameId = getFrameId();
        if(frameId === event.frame){
            saveCommand('expect', event.data);
        }
    });

    // 主窗口
    if(isIframe === false){
        // DOM选择器点击事件
        GlobalEvents.on('selecterClick', function(event){
            domSelectorCallback({
                frame: event.frame,
                path: event.path
            }, event.ctrlKey);
        });
        // 返回断言默认值
        GlobalEvents.on('returnExpectValue', function(value){
            expectGetValueCallback(value);
        });
        function getExpectValue(type, domInfo, param, callback){
            expectGetValueCallback = callback;
            GlobalEvents.emit('getExpectValue', {
                type: type,
                domInfo: domInfo,
                param: param
            });
        }
        // 显示target的path
        GlobalEvents.on('showDomPath', function(path){
            spanShowDomPath.innerHTML = path;
        });
    }

    function hookAlert(){
        // eval with unsafe window
        function unsafeEval(str){
            var head = document.getElementsByTagName("head")[0];
            var script = document.createElement("script");
            script.innerHTML = '('+str+')();';
            head.appendChild(script);
            head.removeChild(script);
        }

        // hook alert, confirm, prompt
        function hookAlertFunction(){
            var rawAlert = window.alert;
            function sendAlertCmd(cmd, data){
                var cmdInfo = {
                    cmd: cmd,
                    data: data || {}
                };
                window.postMessage({
                    'type': 'uiRecorderAlertCommand',
                    'cmdInfo': cmdInfo
                }, '*');
            }
            window.alert = function(str){
                var ret = rawAlert.call(this, str);
                sendAlertCmd('acceptAlert');
                return ret;
            }
            var rawConfirm = window.confirm;
            window.confirm = function(str){
                var ret = rawConfirm.call(this, str);
                sendAlertCmd(ret?'acceptAlert':'dismissAlert');
                return ret;
            }
            var rawPrompt = window.prompt;
            window.prompt = function(str){
                var ret = rawPrompt.call(this, str);
                if(ret === null){
                    sendAlertCmd('dismissAlert');
                }
                else{
                    sendAlertCmd('setAlert', {
                        text: ret
                    });
                    sendAlertCmd('acceptAlert');
                }
                return ret;
            }
            function wrapBeforeUnloadListener(oldListener){
                var newListener = function(e){
                    var returnValue = oldListener(e);
                    if(returnValue){
                        sendAlertCmd('beforeUnload');
                        setTimeout(function(){
                            sendAlertCmd('cancelBeforeUnload');
                        }, 500);
                    }
                    return returnValue;
                }
                return newListener;
            }
            var rawAddEventListener = window.addEventListener;
            window.addEventListener = function(type, listener, useCapture){
                if(type === 'beforeunload'){
                    listener = wrapBeforeUnloadListener(listener);
                }
                return rawAddEventListener.call(window, type, listener, useCapture);
            };
            setTimeout(function(){
                var oldBeforeunload = window.onbeforeunload;
                if(oldBeforeunload){
                    window.onbeforeunload = wrapBeforeUnloadListener(oldBeforeunload)
                }
            }, 500);
        }
        unsafeEval(hookAlertFunction.toString());
    }
    // 初始化选择器
    function initDomSelecter(){
        divDomSelector = document.createElement("div");
        divDomSelector.id = 'uirecorder-selecter-mask';
        divDomSelector.className = 'uirecorder';
        divDomSelector.innerHTML = '<style>#uirecorder-selecter-mask{display:none;background:rgba(151, 232, 81,0.5);position:fixed;z-index:2147483647;}</style>';
        divDomSelector.addEventListener('click', function(event){
            event.stopPropagation();
            event.preventDefault();
            endDomSelector();
        });
        document.body.appendChild(divDomSelector);
    }

    // 显示当前hover的dom
    function showSelecterHover(clientX, clientY){
        divDomSelector.style.display = 'none';
        var newSelectDom = document.elementFromPoint(clientX, clientY);
        if(newSelectDom && isNotInToolsPannel(newSelectDom) && /^(HTML|IFRAME)$/i.test(newSelectDom.tagName) === false){
            divDomSelector.style.display = 'block';
            if(newSelectDom !== lastSelectDom){
                var rect = newSelectDom.getBoundingClientRect();
                divDomSelector.style.left = rect.left+'px';
                divDomSelector.style.top = rect.top+'px';
                divDomSelector.style.width = rect.width+'px';
                divDomSelector.style.height = rect.height+'px';
                var frameId = getFrameId();
                GlobalEvents.emit('selecterHover', {
                    frame: frameId,
                    path: getDomPath(newSelectDom)
                });
                lastSelectDom = newSelectDom;
            }
        }
    }

    // 结束DOM选择器
    function endDomSelector(){
        if(lastSelectDom !== null){
            var frameId = getFrameId();
            setGlobalWorkMode('pauseAll');
            GlobalEvents.emit('selecterClick', {
                frame: frameId,
                path: getDomPath(lastSelectDom),
                ctrlKey: event.ctrlKey
            });
        }
    }

    // 清除dom选择器
    function removeSelector(){
        if(divDomSelector){
            document.body.removeChild(divDomSelector);
            divDomSelector = null;
        }
    }

    // 判断事件是否在工具面板
    function isNotInToolsPannel(target){
        while(target){
            if(/uirecorder/.test(target.className)){
                return false;
            }
            target = target.parentNode;
        }
        return true;
    }

    // 初始化事件
    function initRecorderEvent(){

        document.addEventListener('mousemove', function(event){
            var target = event.target;
            if(divDomSelector){
                event.stopPropagation();
                event.preventDefault();
                showSelecterHover(event.clientX, event.clientY);
            }
            else if(isNotInToolsPannel(target) && !isRecording && isStopEvent){
                event.stopPropagation();
                event.preventDefault();
            }
        }, true);

        document.addEventListener('mouseover', function(event){
            if(isNotInToolsPannel(event.target) && !isRecording && isStopEvent){
                event.stopPropagation();
                event.preventDefault();
            }
        }, true);

        document.addEventListener('mouseout', function(event){
            if(isNotInToolsPannel(event.target) && !isRecording && isStopEvent){
                event.stopPropagation();
                event.preventDefault();
            }
        }, true);

        document.addEventListener('dblclick', function(event){
            if(isNotInToolsPannel(event.target) && !isRecording && isStopEvent){
                event.stopPropagation();
                event.preventDefault();
            }
        }, true);
        // catch event
        document.addEventListener('mousedown', function(event){
            var target = event.target;
            if(target.shadowRoot){
                target = event.path[0];
            }
            if(isNotInToolsPannel(target)){
                if(isRecording){
                    if(/^(html|select|optgroup|option)$/i.test(target.tagName) === false && isFileInput(target) === false){
                        var labelTarget = getLabelTarget(target);
                        if(labelTarget){
                            target = labelTarget;
                        }
                        saveParentsOffset(target);
                        var path = getDomPath(target);
                        if(path !== null){
                            var offset = target.getBoundingClientRect();
                            var x,y;
                            if(labelTarget){
                                x = Math.floor(offset.width / 2);
                                y = Math.floor(offset.height / 2);
                            }
                            else{
                                x = event.clientX-offset.left;
                                y = event.clientY-offset.top;
                            }
                            GlobalEvents.emit('showDomPath', path);
                            saveCommand('mouseDown', {
                                path: path,
                                x: x,
                                y: y,
                                button: event.button,
                                text: getTargetText(target)
                            });
                        }
                    }
                }
                else if(isStopEvent){
                    event.stopPropagation();
                    event.preventDefault();
                }
            }
        }, true);

        document.addEventListener('mouseup', function(event){
            var target = event.target;
            if(target.shadowRoot){
                target = event.path[0];
            }
            if(isNotInToolsPannel(target)){
                if(isRecording){
                    var tagName = target.tagName;
                    if(/^(html|select|optgroup|option)$/i.test(tagName) === false && isFileInput(target) === false){
                        // get offset of the fixed parent
                        var labelTarget = getLabelTarget(target);
                        if(labelTarget){
                            target = labelTarget;
                        }
                        var fixedParent = getFixedParent(target);
                        if(fixedParent !== null){
                            var offset = target.getBoundingClientRect();
                            var x,y;
                            if(labelTarget){
                                x = Math.floor(offset.width / 2);
                                y = Math.floor(offset.height / 2);
                            }
                            else{
                                x = event.clientX-fixedParent.left;
                                y = event.clientY-fixedParent.top;
                            }
                            GlobalEvents.emit('showDomPath', fixedParent.path);
                            saveCommand('mouseUp', {
                                path: fixedParent.path,
                                x: x,
                                y: y,
                                button: event.button,
                                text: getTargetText(target)
                            });
                        }
                    }
                }
                else if(isStopEvent){
                    event.stopPropagation();
                    event.preventDefault();
                }
            }
        }, true);

        // mobile event
        document.addEventListener('touchstart', function(event){
            var touchEvent = event.targetTouches[0];
            var target = touchEvent.target;
            if(isNotInToolsPannel(target)){
                if(isRecording){

                }
                else{
                    if(divDomSelector){
                        showSelecterHover(touchEvent.clientX, touchEvent.clientY);
                    }
                    if(isStopEvent){
                        event.stopPropagation();
                        event.preventDefault();
                    }
                }
            }
        }, true);

        document.addEventListener('touchmove', function(event){
            var touchEvent = event.targetTouches[0];
            var target = touchEvent.target;
            if(isNotInToolsPannel(target)){
                if(isRecording){

                }
                else{
                    if(divDomSelector){
                        showSelecterHover(touchEvent.clientX, touchEvent.clientY);
                    }
                    if(isStopEvent){
                        event.stopPropagation();
                        event.preventDefault();
                    }
                }
            }
        }, true);

        document.addEventListener('touchend', function(event){
            var touchEvent = event.changedTouches[0];
            var target = touchEvent.target;
            if(isNotInToolsPannel(target)){
                if(isRecording){

                }
                else{
                    if(divDomSelector){
                        endDomSelector();
                    }
                    if(isStopEvent){
                        event.stopPropagation();
                        event.preventDefault();
                    }
                }
            }
        }, true);


        // save all parents offset
        var mapParentsOffset = {};
        function saveParentsOffset(target){
            var documentElement = document.documentElement;
            mapParentsOffset = {};
            while(target !== null){
                var nodeName = target.nodeName.toLowerCase();
                if(nodeName !== '#document-fragment'){
                    var path = getDomPath(target);
                    var rect = target.getBoundingClientRect();
                    mapParentsOffset[path] = {
                        left: parseInt(rect.left, 10),
                        top: parseInt(rect.top, 10)
                    };
                }
                if(nodeName === 'html'){
                    target = null;
                }
                else{
                    target = target.parentNode || target.host;
                }
            }
        }

        // get the fixed offset parent
        function getFixedParent(target){
            var documentElement = document.documentElement;
            var node = target;
            var nodeName, path, offset, left, top, savedParent;
            while(node !== null){
                nodeName = node.nodeName.toLowerCase();
                if(nodeName !== '#document-fragment'){
                    path = getDomPath(node);
                    if(path === null){
                        break;
                    }
                    offset = node.getBoundingClientRect();
                    left = parseInt(offset.left, 10);
                    top = parseInt(offset.top, 10);
                    savedParent = mapParentsOffset[path];
                    if(savedParent && left === savedParent.left && top === savedParent.top){
                        return {
                            path: path,
                            left: left,
                            top: top
                        };
                    }
                }
                if(nodeName === 'html'){
                    node = null;
                }
                else{
                    node = node.parentNode;
                }
            }
            path = getDomPath(target);
            if(path !== null){
                offset = target.getBoundingClientRect();
                return {
                    path: path,
                    left: offset.left,
                    top: offset.top
                };
            }
            else{
                return null;
            }
        }

        var modifierKeys = {
            17: 'CTRL', // Ctrl
            18: 'ALT', // Alt
            16: 'SHIFT', // Shift
            91: 'META' // Command/Meta
        };

        var NonTextKeys = {
            8: 'BACK_SPACE', // BACK_SPACE
            9: 'TAB', // TAB
            13: 'ENTER', // ENTER
            19: 'PAUSE', // PAUSE
            27: 'ESCAPE', // ESCAPE
            33: 'PAGE_UP', // PAGE_UP
            34: 'PAGE_DOWN', // PAGE_DOWN
            35: 'END', // END
            36: 'HOME', // HOME
            37: 'LEFT', // LEFT
            38: 'UP', // UP
            39: 'RIGHT', // RIGHT
            40: 'DOWN', // DOWN
            45: 'INSERT', // INSERT
            46: 'DELETE' // DELETE
        };

        // catch keydown event
        var lastModifierKeydown = null;
        var isModifierKeyRecord = false; // 是否记录控制键
        document.addEventListener('keydown', function(event){
            var target = event.target;
            if(isNotInToolsPannel(target)){
                var keyCode = event.keyCode;
                var modifierKey = modifierKeys[keyCode];
                var NonTextKey = NonTextKeys[keyCode];
                if(isRecording){
                    var stickModifierKey;
                    if(event.ctrlKey){
                        stickModifierKey = 'CTRL';
                    }
                    else if(event.altKey){
                        stickModifierKey = 'ALT';
                    }
                    else if(event.shiftKey){
                        stickModifierKey = 'SHIFT';
                    }
                    else if(event.metaKey){
                        stickModifierKey = 'META';
                    }
                    if(modifierKey){
                        // 控制键只触发一次keyDown
                        if(isModifierKeyRecord && modifierKey !== lastModifierKeydown){
                            lastModifierKeydown = modifierKey;
                            saveCommand('keyDown', {
                                character: modifierKey
                            });
                        }
                    }
                    else if(NonTextKey){
                        if(stickModifierKey && isModifierKeyRecord === false){
                            isModifierKeyRecord = true;
                            saveCommand('keyDown', {
                                character: stickModifierKey
                            });
                        }
                        saveCommand('sendKeys', {
                            keys: '{'+NonTextKey+'}'
                        });
                    }
                    else if(stickModifierKey === 'CTRL'){
                        var typedCharacter = String.fromCharCode(keyCode);
                        if(/^[azcxv]$/i.test(typedCharacter)){
                            if(isModifierKeyRecord === false){
                                isModifierKeyRecord = true;
                                saveCommand('keyDown', {
                                    character: stickModifierKey
                                });
                            }
                            saveCommand('sendKeys', {
                                keys: typedCharacter.toLowerCase()
                            });
                        }
                    }
                }
                else if(isStopEvent){
                    event.stopPropagation();
                    event.preventDefault();
                }
            }
        }, true);

        // catch keyup event
        document.addEventListener('keyup', function(event){
            var target= event.target;
            if(isNotInToolsPannel(target)){
                var modifierKey = modifierKeys[event.keyCode];
                if(isRecording){
                    if(isModifierKeyRecord && modifierKey){
                        isModifierKeyRecord = false;
                        lastModifierKeydown = null;
                        saveCommand('keyUp', {
                            character: modifierKey
                        });
                    }
                }
                else{
                    if(!isRecording && event.keyCode === 27){
                        setGlobalWorkMode('record');
                    }
                    if(isStopEvent){
                        event.stopPropagation();
                        event.preventDefault();
                    }
                }
            }
        }, true);

        // catch keypress event
        document.addEventListener('keypress', function(event){
            var target = event.target;
            if(isNotInToolsPannel(target) && /^(HTML|IFRAME)$/i.test(target.tagName) === false){
                if(isRecording){
                    var typedCharacter = String.fromCharCode(event.keyCode);
                    if(typedCharacter !== '' && /[\r\n]/.test(typedCharacter) === false){
                        saveCommand('sendKeys', {
                            keys: typedCharacter
                        });
                    }
                }
                else if(isStopEvent){
                    event.stopPropagation();
                    event.preventDefault();
                }
            }
        }, true);

        document.addEventListener('compositionend', function(event){
            var target = event.target;
            if(isNotInToolsPannel(target)){
                if(isRecording){
                    saveCommand('sendKeys', {
                        keys:event.data
                    });
                }
                else if(isStopEvent){
                    event.stopPropagation();
                    event.preventDefault();
                }
            }
        }, true);

        var lastScroll = {};
        var scrollEventTimer = null;
        document.addEventListener('scroll', function(event){
            var target = event.target;
            if(isNotInToolsPannel(target)){
                if(isRecording){
                    var pageOffset = {
                        x: window.pageXOffset,
                        y: window.pageYOffset
                    };
                    if(pageOffset.x !== lastScroll.x || pageOffset.y !== lastScroll.y){
                        scrollEventTimer && clearTimeout(scrollEventTimer);
                        scrollEventTimer = setTimeout(function(){
                            saveCommand('scrollTo', pageOffset);
                        }, 500);
                        lastScroll = pageOffset;
                    }
                }
                else if(isStopEvent){
                    event.stopPropagation();
                    event.preventDefault();
                }
            }
        }, true);

        // catch file change
        function isFileInput(target){
            return target.tagName === 'INPUT' && target.getAttribute('type') === 'file';
        }
        document.addEventListener('change', function(event){
            var target = event.target;
            if(isNotInToolsPannel(target)){
                if(isRecording){
                    if(isFileInput(target)){
                        var path = getDomPath(target);
                        var filepath = target.value || '';
                        var match = filepath.match(/[^\\\/]+$/);
                        if(path !== null && match !== null){
                            GlobalEvents.emit('showDomPath', path);
                            saveCommand('uploadFile', {
                                path: path,
                                filename: match[0],
                                text: getTargetText(target)
                            });
                        }
                    }
                    else if(target.tagName === 'SELECT'){
                        if(isDomVisible(target)){
                            // no record invisible select
                            var path = getDomPath(target);
                            if(path !== null){
                                var index = target.selectedIndex;
                                var option = target.options[index];
                                var value = option.getAttribute('value');
                                var type;
                                if(value){
                                    type = 'value';
                                }
                                else{
                                    type = 'index';
                                    value = index;
                                }
                                GlobalEvents.emit('showDomPath', path);
                                saveCommand('select', {
                                    path: path,
                                    type: type,
                                    value: value,
                                    text: getTargetText(target)
                                });
                            }
                        }
                    }
                }
                else if(isStopEvent){
                    event.stopPropagation();
                    event.preventDefault();
                }
            }
        }, true);
    }

    // 初始化dom
    function initRecorderDom(){
        var recorderLoaded = document.getElementById('uirecorderloaded');
        if(recorderLoaded){
            // 定时探测DOM是否被破坏
            setTimeout(initRecorderDom, 200);
            return;
        }

        // 加载探测
        recorderLoaded = document.createElement("span");
        recorderLoaded.id = 'uirecorderloaded';
        recorderLoaded.style.display = 'none';
        document.body.appendChild(recorderLoaded);

        // 初始化工具面板
        function initToolsPannel(){
            // tools pannel
            var baseUrl = chrome.extension.getURL("/");
            var divDomToolsPannel = document.createElement("div");
            divDomToolsPannel.id = 'uirecorder-tools-pannel';
            divDomToolsPannel.className = 'uirecorder';
            var arrHTML = [
                '<div style="padding:5px;color:#666"><strong>DomPath: </strong><span id="uirecorder-path"></span></div>',
                '<div><span class="uirecorder-button"><a name="uirecorder-hover"><img src="'+baseUrl+'img/hover.png" alt="">'+__('button_hover_text')+'</a></span><span class="uirecorder-button"><a name="uirecorder-expect"><img src="'+baseUrl+'img/expect.png" alt="">'+__('button_expect_text')+'</a></span><span class="uirecorder-button"><a name="uirecorder-vars"><img src="'+baseUrl+'img/vars.png" alt="">'+__('button_vars_text')+'</a></span><span class="uirecorder-button"><a name="uirecorder-module"><img src="'+baseUrl+'img/module.png" alt="">'+__('button_module_text')+'</a></span><span class="uirecorder-button"><a name="uirecorder-end"><img src="'+baseUrl+'img/end.png" alt="">'+__('button_end_text')+'</a></span></div>',
                '<style>#uirecorder-tools-pannel{position:fixed;z-index:2147483647;padding:20px;width:750px;box-sizing:border-box;border:1px solid #ccc;line-height:1;background:rgba(241,241,241,0.8);box-shadow: 5px 5px 10px #888888;bottom:10px;left:10px;cursor:move;}#uirecorder-path{border-bottom: dashed 1px #ccc;padding:2px;color:#FF7159;}.uirecorder-button{cursor:pointer;margin: 8px;}.uirecorder-button a{text-decoration: none;color:#333333;font-family: arial, sans-serif;font-size: 13px;color: #777;text-shadow: 1px 1px 0px white;background: -webkit-linear-gradient(top, #ffffff 0%,#dfdfdf 100%);border-radius: 3px;box-shadow: 0 1px 3px 0px rgba(0,0,0,0.4);padding: 6px 12px;}.uirecorder-button a:hover{background: -webkit-linear-gradient(top, #ffffff 0%,#eee 100%);box-shadow: 0 1px 3px 0px rgba(0,0,0,0.4);}.uirecorder-button a:active{background: -webkit-linear-gradient(top, #dfdfdf 0%,#f1f1f1 100%);box-shadow: 0px 1px 1px 1px rgba(0,0,0,0.2) inset, 0px 1px 1px 0 rgba(255,255,255,1);}.uirecorder-button a img{display:inline-block;padding-right: 8px;position: relative;top: 2px;vertical-align:baseline;width:auto;height:auto;}</style>'
            ];
            divDomToolsPannel.innerHTML = arrHTML.join('');
            var diffX = 0, diffY =0;
            var isDrag = false, isMove = false;
            divDomToolsPannel.addEventListener('selectstart', function(event){
                event.stopPropagation();
                event.preventDefault();
            });
            function onMouseDown(event){
                var touchEvent = event.targetTouches ? event.targetTouches[0] : event;
                diffX = touchEvent.clientX - divDomToolsPannel.offsetLeft;
                diffY = touchEvent.clientY - divDomToolsPannel.offsetTop;
                isDrag = true;
            }
            divDomToolsPannel.addEventListener('mousedown', onMouseDown);
            divDomToolsPannel.addEventListener('touchstart', onMouseDown);
            function onMouseMove(event){
                var touchEvent = event.targetTouches ? event.targetTouches[0] : event;
                if(isDrag && touchEvent.clientX > 0 && touchEvent.clientY > 0){
                    isMove = true;
                    event.stopPropagation();
                    event.preventDefault();
                    divDomToolsPannel.style.left = touchEvent.clientX - diffX + 'px';
                    divDomToolsPannel.style.top = touchEvent.clientY - diffY + 'px';
                    divDomToolsPannel.style.bottom = 'auto';
                    divDomToolsPannel.style.right = 'auto';
                }
            }
            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('touchmove', onMouseMove);
            function onMouseUp(event){
                if(isMove){
                    event.stopPropagation();
                    event.preventDefault();
                }
                isMove = false;
                isDrag = false;
            }
            divDomToolsPannel.addEventListener('mouseup', onMouseUp);
            divDomToolsPannel.addEventListener('touchend', onMouseUp);
            divDomToolsPannel.addEventListener('click', function(event){
                event.stopPropagation();
                event.preventDefault();
                var target = event.target;
                if(target.tagName === 'IMG'){
                    target = target.parentNode;
                }
                var name = target.name;
                switch(name){
                    case 'uirecorder-hover':
                        hideDialog();
                        showSelector(function(domInfo, requirePause){
                            // 使事件可以触发
                            setGlobalWorkMode('pauseRecord');
                            // 添加悬停
                            GlobalEvents.emit('addHover', domInfo);
                            // 恢复录制或暂停
                            setGlobalWorkMode(requirePause?'pauseAll':'record');
                        });
                        break;
                    case 'uirecorder-expect':
                        hideDialog();
                        showSelector(function(domInfo, requirePause){
                            showExpectDailog(domInfo, function(frameId, expectData){
                                if(expectData.type === 'alert'){
                                    lastAlertExpect = expectData;
                                }
                                else{
                                    GlobalEvents.emit('addExpect', {
                                        frame: frameId,
                                        data: expectData
                                    })
                                }
                                setGlobalWorkMode(requirePause?'pauseAll':'record');
                            });
                        });
                        break;
                    case 'uirecorder-vars':
                        hideDialog();
                        showSelector(function(domInfo, requirePause){
                            showVarsDailog(function(varInfo){
                                if(varInfo.isNew){
                                    testVars[varInfo.name] = varInfo.value;
                                }
                                GlobalEvents.emit('setVar', {
                                    frame: domInfo.frame,
                                    path: domInfo.path,
                                    varinfo: varInfo
                                });
                                setGlobalWorkMode(requirePause?'pauseAll':'record');
                            });
                        });
                        break;
                    case 'uirecorder-module':
                        showModuleDailog(function(specName){
                            saveCommand('module', specName);
                        });
                        break;
                    case 'uirecorder-end':
                        chrome.runtime.sendMessage({
                            type: 'end'
                        });
                        break;
                }
            });
            function showSelector(callback){
                domSelectorCallback = callback;
                setGlobalWorkMode('select');
            }
            document.body.appendChild(divDomToolsPannel);
            spanShowDomPath = document.getElementById('uirecorder-path');
            // 对话框
            var divDomDialog = document.createElement("div");
            var okCallback = null;
            var cancelCallback = null;
            divDomDialog.id = 'uirecorder-dialog';
            divDomDialog.className = 'uirecorder';
            var arrHTML = [
                '<h2 id="uirecorder-dialog-title"></h2>',
                '<div id="uirecorder-dialog-content"></div>',
                '<div style="padding-bottom:10px;text-align:center;"><span class="uirecorder-button"><a name="uirecorder-ok"><img src="'+baseUrl+'img/ok.png" alt="">'+__('dialog_ok')+'</a></span><span class="uirecorder-button"><a name="uirecorder-cancel"><img src="'+baseUrl+'img/cancel.png" alt="">'+__('dialog_cancel')+'</a></span></div>',
                '<style>#uirecorder-dialog{display:none;position:fixed;z-index:2147483647;padding:20px;top:50%;left:50%;width:480px;margin-left:-240px;margin-top:-160px;box-sizing:border-box;border:1px solid #ccc;background:rgba(241,241,241,1);box-shadow: 5px 5px 10px #888888;}#uirecorder-dialog h2{padding-bottom:10px;border-bottom: solid 1px #ccc;margin-bottom:10px;color:#333;}#uirecorder-dialog ul{list-style:none;padding:0;}#uirecorder-dialog li{padding: 5px 0 5px 30px;}#uirecorder-dialog li label{display:inline-block;width:100px;color:#666}#uirecorder-dialog li input,#uirecorder-dialog li select,#uirecorder-dialog li textarea{display:inline-block;font-size:16px;border:1px solid #ccc;border-radius:2px;padding:5px;}#uirecorder-dialog li input,#uirecorder-dialog li textarea{width:250px;}</style>'
            ];
            divDomDialog.innerHTML = arrHTML.join('');
            document.body.appendChild(divDomDialog);
            var domDialogTitle = document.getElementById('uirecorder-dialog-title');
            var domDialogContent = document.getElementById('uirecorder-dialog-content');
            divDomDialog.addEventListener('click', function(event){
                event.stopPropagation();
                event.preventDefault();
                var target = event.target;
                if(target.tagName === 'IMG'){
                    target = target.parentNode;
                }
                var name = target.name;
                switch(name){
                    case 'uirecorder-ok':
                        hideDialog();
                        okCallback();
                        break;
                    case 'uirecorder-cancel':
                        hideDialog();
                        cancelCallback();
                        break;
                }
            });
            // 显示对话框
            function showDialog(title, content, events){
                domDialogTitle.innerHTML = title;
                domDialogContent.innerHTML = content;
                var onInit = events.onInit;
                if(onInit){
                    onInit();
                }
                okCallback = events.onOk;
                cancelCallback = events.onCancel;
                divDomDialog.style.display = 'block';
            }
            // 隐藏对话框
            function hideDialog(){
                domDialogTitle.innerHTML = '';
                domDialogContent.innerHTML = '';
                divDomDialog.style.display = 'none';
            }
            function showExpectDailog(expectTarget, callback){
                var arrHtmls = [
                    '<ul>',
                    '<li><label>'+__('dialog_expect_type')+'</label><select id="uirecorder-expect-type" value=""><option>val</option><option>text</option><option>displayed</option><option>enabled</option><option>selected</option><option>attr</option><option>css</option><option>url</option><option>title</option><option>cookie</option><option>localStorage</option><option>sessionStorage</option><option>alert</option></select></li>',
                    '<li id="uirecorder-expect-dom-div"><label>'+__('dialog_expect_dom')+'</label><input id="uirecorder-expect-dom" type="text" /></li>',
                    '<li id="uirecorder-expect-param-div"><label>'+__('dialog_expect_param')+'</label><input id="uirecorder-expect-param" type="text" /></li>',
                    '<li><label>'+__('dialog_expect_compare')+'</label><select id="uirecorder-expect-compare"><option>equal</option><option>contain</option><option>regexp</option></select></li>',
                    '<li><label>'+__('dialog_expect_to')+'</label><textarea id="uirecorder-expect-to"></textarea></li>',
                    '</ul>'
                ];
                var domExpectDomDiv, domExpectParamDiv, domExpectType, domExpectDom, domExpectParam, domExpectCompare, domExpectTo;
                var reDomRequire = /^(val|text|displayed|enabled|selected|attr|css)$/;
                var reParamRequire = /^(attr|css|cookie|localStorage|sessionStorage|alert)$/;
                showDialog(__('dialog_expect_title'), arrHtmls.join(''), {
                    onInit: function(){
                        // 初始化dom及事件
                        domExpectDomDiv = document.getElementById('uirecorder-expect-dom-div');
                        domExpectParamDiv = document.getElementById('uirecorder-expect-param-div');
                        domExpectType = document.getElementById('uirecorder-expect-type');
                        domExpectDom = document.getElementById('uirecorder-expect-dom');
                        domExpectParam = document.getElementById('uirecorder-expect-param');
                        domExpectCompare = document.getElementById('uirecorder-expect-compare');
                        domExpectTo = document.getElementById('uirecorder-expect-to');
                        domExpectType.onchange = function(){
                            var type = domExpectType.value;
                            domExpectDomDiv.style.display = reDomRequire.test(type) ? 'block' : 'none';
                            domExpectParamDiv.style.display = reParamRequire.test(type) ? 'block' : 'none';
                            switch(type){
                                case 'alert':
                                    domExpectParam.value = 'mouseUp';
                                    break;
                            }
                            refreshToValue();
                        };
                        domExpectParam.onchange = refreshToValue
                        function refreshToValue(){
                            var type = domExpectType.value;
                            var param = domExpectParam.value;
                            switch(type){
                                case 'url':
                                    domExpectTo.value = location.href;
                                    break;
                                case 'title':
                                    domExpectTo.value = document.title;
                                    break;
                                case 'cookie':
                                    if(param){
                                        domExpectTo.value = getCookie(param) || '';
                                    }
                                    break;
                                case 'localStorage':
                                    if(param){
                                        domExpectTo.value = localStorage.getItem(param) || '';
                                    }
                                    break;
                                case 'sessionStorage':
                                    if(param){
                                        domExpectTo.value = sessionStorage.getItem(param) || '';
                                    }
                                    break;
                                default:
                                    // 到iframe中获取默认值
                                    getExpectValue(type, expectTarget, param, function(value){
                                        domExpectTo.value = value;
                                    });
                            }
                        }
                        // 初始化默认值
                        domExpectType.value = 'val';
                        domExpectDom.value = expectTarget.path;
                        domExpectParam.value = '';
                        domExpectCompare.value = 'equal';
                        domExpectTo.value = '';
                        domExpectType.onchange();
                    },
                    onOk: function(){
                        var type = domExpectType.value;
                        var arrParams = [];
                        reDomRequire.test(type) && arrParams.push(domExpectDom.value);
                        reParamRequire.test(type) && arrParams.push(domExpectParam.value);
                        var compare = domExpectCompare.value;
                        var to = domExpectTo.value;
                        if(compare === 'regexp'){
                            try{
                                eval(to);
                            }
                            catch(e){
                                domExpectTo.focus();
                                return alert(__('dialog_expect_regtip'));
                            }
                        }
                        var expectData = {
                            type: type,
                            params: arrParams,
                            compare:compare,
                            to: to
                        };
                        callback(expectTarget.frame, expectData);
                    },
                    onCancel: function(){
                        setGlobalWorkMode('record');
                    }
                });
            }
            function showVarsDailog(callback){
                var arrHtmls = [
                    '<ul>',
                    '<li><label>'+__('dialog_vars_type')+'</label><select id="uirecorder-vars-type"><option value="standard" selected>'+__('dialog_vars_type_standard')+'</option><option value="faker">'+__('dialog_vars_type_faker')+'</option></select></li>',
                    '<li><label>'+__('dialog_vars_name')+'</label><span id="uirecorder-vars-namearea"><select id="uirecorder-vars-name" value="">',
                ];
                for(var name in testVars){
                    arrHtmls.push('<option>'+name+'</option>');
                }
                arrHtmls.push('</select> <a href="#" id="uirecorder-vars-editname">'+__('dialog_vars_editname')+'</a></span></li>');
                arrHtmls.push('<li style="display:none"><label>'+__('dialog_vars_faker_lang')+'</label><select id="uirecorder-vars-faker-lang" value="en"><option value="en_AU">Australia (English)</option><option value="en_au_ocker">Australia Ocker (English)</option><option value="en_BORK">Bork (English)</option><option value="en_CA">Canada (English)</option><option value="fr_CA">Canada (French)</option><option value="zh_CN">Chinese</option><option value="zh_TW">Chinese (Taiwan)</option><option value="nl">Dutch</option><option value="en" selected>English</option><option value="fa">Farsi</option><option value="fr">French</option><option value="ge">Georgian</option><option value="de">German</option><option value="de_AT">German (Austria)</option><option value="de_CH">German (Switzerland)</option><option value="en_GB">Great Britain (English)</option><option value="en_IND">India (English)</option><option value="id_ID">Indonesia</option><option value="en_IE">Ireland (English)</option><option value="it">Italian</option><option value="ja">Japanese</option><option value="ko">Korean</option><option value="nep">Nepalese</option><option value="nb_NO">Norwegian</option><option value="pl">Polish</option><option value="pt_BR">Portuguese (Brazil)</option><option value="ru">Russian</option><option value="sk">Slovakian</option><option value="es">Spanish</option><option value="es_MX">Spanish Mexico</option><option value="sv">Swedish</option><option value="tr">Turkish</option><option value="uk">Ukrainian</option><option value="en_US">United States (English)</option><option value="vi">Vietnamese</option></select></li>');
                arrHtmls.push('<li style="display:none"><label>'+__('dialog_vars_faker_str')+'</label><input id="uirecorder-vars-faker-str" type="text" value="{{name.lastName}} {{name.firstName}}" /></li>');
                arrHtmls.push('<li><label>'+__('dialog_vars_value')+'</label><input id="uirecorder-vars-value" type="text" readonly /></li>');
                arrHtmls.push('</ul>');
                var isNewName = false; // 是否新变量
                var domVarsType, domVarsNameArea, domVarsName, domVarsEditName, domVarsFakerLang, domVarsFakerStr, domVarsValue;
                showDialog(__('dialog_vars_title'), arrHtmls.join(''), {
                    onInit: function(){
                        // 初始化dom及事件
                        domVarsType = document.getElementById('uirecorder-vars-type');
                        domVarsNameArea = document.getElementById('uirecorder-vars-namearea');
                        domVarsName = document.getElementById('uirecorder-vars-name');
                        domVarsEditName = document.getElementById('uirecorder-vars-editname');
                        domVarsFakerLang = document.getElementById('uirecorder-vars-faker-lang');
                        domVarsFakerStr = document.getElementById('uirecorder-vars-faker-str');
                        domVarsValue = document.getElementById('uirecorder-vars-value');
                        domVarsEditName.onclick = function(){
                            domVarsNameArea.innerHTML = '<input id="uirecorder-vars-name" type="text" attr-new="1" >';
                            var oldName = domVarsName.value;
                            domVarsName = document.getElementById('uirecorder-vars-name');
                            domVarsName.value = oldName;
                            domVarsName.focus();
                            domVarsValue.readOnly = false;
                            isNewName = true;
                        }
                        domVarsType.onchange = function(){
                            if(domVarsType.value === 'faker'){
                                domVarsName.parentNode.parentNode.style.display = 'none';
                                domVarsFakerLang.parentNode.style.display = 'block';
                                domVarsFakerStr.parentNode.style.display = 'block';
                                makeFaker();
                            }
                            else{
                                domVarsName.parentNode.parentNode.style.display = 'block';
                                domVarsFakerLang.parentNode.style.display = 'none';
                                domVarsFakerStr.parentNode.style.display = 'none';
                                domVarsName.onchange();
                                isNewName = false;
                            }
                        }
                        function makeFaker(){
                            var fakerResult = '';
                            try{
                                faker.locale = domVarsFakerLang.value;
                                fakerResult = faker.fake(domVarsFakerStr.value);
                            }
                            catch(e){}
                            domVarsValue.value = fakerResult;
                        }
                        domVarsFakerLang.onchange = makeFaker;
                        domVarsFakerStr.onkeyup = makeFaker;
                        domVarsName.onchange = function(){
                            var value = testVars[domVarsName.value];
                            domVarsValue.value = value || '';
                        };
                        domVarsName.onchange();
                    },
                    onOk: function(){
                        var type = domVarsType.value;
                        if(type === 'faker'){
                            callback({
                                type: type,
                                lang: domVarsFakerLang.value,
                                str: domVarsFakerStr.value,
                                value: domVarsValue.value
                            });
                        }
                        else{
                            callback({
                                type: type,
                                name: domVarsName.value,
                                value: domVarsValue.value,
                                isNew: isNewName
                            });
                        }
                    },
                    onCancel: function(){
                        setGlobalWorkMode('record');
                    }
                });
            }

            function showModuleDailog(callback){
                var arrHtmls = [
                    '<ul>',
                    '<li><label>'+__('dialog_module_specname')+'</label><select id="uirecorder-spec-name" value="">',
                ];
                for(var i in specLists){
                    arrHtmls.push('<option>'+specLists[i]+'</option>');
                }
                arrHtmls.push('</select></li>');
                arrHtmls.push('</ul>');
                setGlobalWorkMode('pauseAll');
                var domSpecName = document.getElementById('uirecorder-vars-type');
                showDialog(__('dialog_module_title'), arrHtmls.join(''), {
                    onInit: function(){
                       domSpecName = document.getElementById('uirecorder-spec-name');
                    },
                    onOk: function(){
                        setGlobalWorkMode('pauseRecord');
                        var specName = domSpecName.value;
                        specName && callback(specName);
                    },
                    onCancel: function(){
                        setGlobalWorkMode('record');
                    }
                });
            }
        }

        if(isIframe === false){
            initToolsPannel();
        }
        isRecording = true;

        // 定时探测DOM是否被破坏
        setTimeout(initRecorderDom, 200);
    }

})();
