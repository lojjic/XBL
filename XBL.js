/*
**  XBL.js, created by Jason Johnston (jj/at/lojjic/dot/net) January 2004
**
**  This is an implementation of major parts of the 
**  eXtensible Binding Language (XBL) for MSIE/Win (and 
**  hopefully others someday). For usage and other details 
**  see http://svn.lojjic.net/XBL/trunk/XBL-doc.html
**
**  The contents of this file are subject to the Mozilla Public License
**  Version 1.1; for more details see the documentation file.
*/

	
// ElementXBL interface:
if(!window.ElementXBL) {
ElementXBL = {};
ElementXBL.prototype = {
	xblChildNodes : null, //part of spec, not implemented?
	bindingOwner : null,
	anonymousParent : null, //part of spec, not implemented?

	addBinding : function(bindingURL) {
		var XBL_NS = "http://www.mozilla.org/xbl";
		var i, j, k, elt, elt2, elt3;
		var bindingDocURL = bindingURL.split("#")[0];
		
		var bindingDoc = document.loadBindingDocument(bindingDocURL);

		function isXBLElt(element, tagName) {
			return (element.namespaceURI == XBL_NS && element.nodeName.replace(/^[^:]:/, "") == tagName);
		};

		var binding = document._xblBindingsData[bindingURL];
		if(!binding) return; //requested binding does not exist!

		// Inherit from binding in extends attribute:
		var ext = binding.extend;
		if(ext) {
			if(ext.indexOf("#")==0) ext = bindingDocURL + ext; //handle internal idrefs
			this.addBinding(ext);
			// TODO: This won't work right when both bindings have content sections (should ignore base binding's content?). Need to handle that.
			// TODO: Make way to get to superclass's implementation by name (in spec but not implemented in Moz?)
		}
		
		// <script>:
		// Not yet implemented.


		// <stylesheet>:
		// Not yet implemented.


		// <image>: (preloads images)
		for(i=0; (elt=binding.images[i]); i++) new Image().src = elt.getAttribute("src");


		// <content>:
		if(binding.content) {
			// Recursive function to walk the content template tree and recreate each node as HTML --
			// We can't just cloneNode() because IE doesn't allow mixing XML and HTML nodes, so we need
			// to make the XML nodes look like HTML ones. It's OK because this is HTML-only anyway.
			// We also do attribute forwarding here.
			function cloneNodeAsHTML(node, boundElt) {
				var i, j, k, x, y, z;
				switch (node.nodeType) {
				case 1: //Element
					var newNode = document.createElement(node.nodeName.replace(/^[^:]*:/, "").toLowerCase()=="content" && node.namespaceURI==XBL_NS ? "div" : node.tagName.replace(/^\w+:/i, "")); //recreate element, removing prefix; make xbl:content element into div so IE5 behaves
					for(i=0; (x = node.attributes[i]); i++) { //attributes
						if(x.name.match(/^on/)) { //event attributes (have to set as methods rather than attrs):
							newNode[x.name] = new Function(x.value);
							continue;
						}
						switch(x.name) {
						case "xmlns": break;
						case "style": newNode.style.cssText = x.value; break;
						case "class": newNode.className = x.value; break;
						case "xbl:inherits": //attribute forwarding; generated element inherits attribute from bound element:
							var attrs = x.value.split(",");
							for(j=0; (y=attrs[j]); j++) {
								var v="", p=y.split("="); //attribute renaming
								if(p[1] && p[1]=="xbl:text") { //value is coalesced child text nodes
									z = boundElt.childNodes;
									for(k=0; k<z.length; k++) if(z[k].nodeType==3) v+=z[k].nodeValue;
								}
								else v = boundElt.getAttribute(p[1] || p[0]); //value is attribute
								if(p[0]=="xbl:text") newNode.appendChild(document.createTextNode(v)); //value forwarded into text content
								else newNode.setAttribute(p[0], v); //value forwarded into attribute
							}
						break;
						default: newNode.setAttribute(x.name, x.value);
						}
					}
					for(i=0; (x = node.childNodes[i]); i++) if(k=cloneNodeAsHTML(x, boundElt)) newNode.appendChild(k); //children
					newNode.bindingOwner = boundElt; //set bindingOwner property (ElementXBL interface)
					return newNode;
				case 3: //Text
					return document.createTextNode(node.nodeValue);
				default:
					return null;
				}
			};

			// clone it so we work with a HTMLized copy:
			var clone = cloneNodeAsHTML(binding.content, this);

			var insPt = this.insertionPoint = clone.getElementsByTagName("children")[0];
			if(insPt || !this.childNodes.length) { // ignore if no insertion point, unless bound element has no explicit children
				// move all explicit children to insertion point:
				// TODO: implement <children includes="" /> for filtering children to multiple insertion points
				if(insPt) {
					while(elt = this.firstChild) insPt.parentNode.insertBefore(elt, insPt);
					insPt.parentNode.removeChild(insPt);
				}
				// peel off the anonymous nodes and insert into bound element:
				while(elt = clone.firstChild) this.appendChild(elt);
			}
		}


		// <method>:
		for(i=0; (elt = binding.methods[i]); i++) {
			var methodName = elt.getAttribute("name");
			if(!methodName) continue;

			// build the function:
			var methodString = "";
			// create local vars with the param names and set them to the incoming args:
			for(j=0; (elt2 = elt.childNodes[j]); j++) {
				if(isXBLElt(elt2, "parameter")) methodString += "var " + elt2.getAttribute("name") + " = arguments[" + j + "];";
			}
			// add the method body:
			for(j=0; (elt2 = elt.childNodes[j]); j++) {
				if(isXBLElt(elt2, "body") && elt2.firstChild) methodString += elt2.firstChild.nodeValue;
			}
			// attach the function as a method on the element:
			this[methodName] = new Function(methodString);
		}


		// <field>:
		for(i=0; (elt = binding.fields[i]); i++) {
			var fldName = elt.getAttribute("name");
			var fldInit = elt.firstChild;
			if(!fldName || !fldInit || fldInit.nodeType!=3) continue; //skip if no name or contents
			// Set initial value by evaluating script contents:
			this._xblTmp = function(){ return eval(fldInit.nodeValue); };
			this[fldName] = this._xblTmp();
		}

		// <property>:
		for(i=0; (elt = binding.properties[i]); i++) {
			var propName = elt.getAttribute("name");
			if(!propName) continue;

			// onget="" or <getter>:
			// Since I can't define a getter in JScript, the only <property>s that will work are 
			// those where the getter returns the same value the property was last set to.
			// BUT... we *can* use the getter to set the property's initial value:
			var propGet = elt.getAttribute("onget"); //attr gets precedence
			if(!propGet) //fallback to xbl:getter
				for(j=0; (elt2=elt.childNodes[j]); j++) if(isXBLElt(elt2, "getter") && elt2.firstChild) propGet = elt2.firstChild.nodeValue;
			if(propGet) {
				this._xblTmp = new Function(propGet);
				this[propName] = this._xblTmp();
			}

			// onset="" or <setter>:
			// Partially implement this by firing an event whenever the property is changed.
			// Caveats: Can't be used to modify the value before storing it
			var propSet = elt.getAttribute("onset"); //attr gets precedence
			if(!propSet) //fallback to xbl:setter
				for(j=0; (elt2=elt.childNodes[j]); j++) if(isXBLElt(elt2, "setter") && elt2.firstChild) propSet = elt2.firstChild.nodeValue;
			if(propSet) {
				// TODO: implement readonly="true" to disallow setting of property (?)
				// We have to get tricky here to evaluate the setter in the correct context
				this.attachEvent("onpropertychange", new Function(
					"if(window.event.propertyName != '" + propName + "') return;"
					+"var elt = window.event.srcElement;"
					+"elt._xblTmp = new Function('"
					+	"var val = window.event.srcElement." + propName + ";"
					+	propSet.replace(/'/g,"\\'").replace(/\n/g, "\\n") //prevent script errors by double-escaping
					+"');"
					+"elt._xblTmp(); elt._xblTmp = null;"
				));
			}
		}


		// <handler>:
		for(i=0; (elt = binding.handlers[i]); i++) {
			var hdlrEvt = elt.getAttribute("event");
			var hdlrAct = elt.getAttribute("action"); //attr gets precedence.
			if(!hdlrAct && elt.firstChild) hdlrAct = elt.firstChild.nodeValue; //fallback to text content
			var hdlrPhase = elt.getAttribute("phase");
			var attachTo = elt.getAttribute("attachto") || "element";
			if(hdlrEvt && hdlrAct) {
				//build code for filtering events:
				// TODO: clickcount, charcode filters.
				var evtFilters="", btn=elt.getAttribute("button"), kcd=elt.getAttribute("keycode"), mod=elt.getAttribute("modifiers"), pha=elt.getAttribute("phase");
				if(btn) evtFilters += "if(event.button!=" + btn + ") return;"; //TODO: the button integer values are nonstandard in IE's model; need to unify.
				if(kcd) evtFilters += "if(event.keyCode!=" + kcd + ") return;";
				if(mod) {
					var mods = mod.split(/[, ]/g);
					for(var i=0; i<mods.length; i++) {
						switch(mods[i]) {
							case "shift": evtFilters += "if(!event.shiftKey) return;"; break;
							case "alt": case "meta": evtFilters += "if(!event.altKey) return;"; break; //map meta to alt
							case "control": case "accel": evtFilters += "if(!event.ctrlKey) return;"; break; //map accel to ctrl
						}
					}
				}
				if(pha) evtFilters += "if('" + pha + "'=='target' && event.srcElement!=this) return;";  // if target phase specified, only run script if at target.
				//NOTE: this currently only handles "target" or "bubbling" phases; capturing may be implementable using the IEtoW3C library, but ignoring for now since IE doesn't do capturing natively.
				
				var eltHdlrs = this._xblHandlers; // store all handlers in special property - seems hackish, is there another way?
				if(!eltHdlrs) eltHdlrs = this._xblHandlers = {}; // hash: event => [hdlr1, hdlr2, ...] - storage for handlers
				if(!eltHdlrs[hdlrEvt]) eltHdlrs[hdlrEvt]=[]; //start list of handlers for this event
				eltHdlrs[hdlrEvt][eltHdlrs[hdlrEvt].length] = new Function(
					"var event = window.event;"
					+ "event.originalTarget=this; event.target=event.srcElement;" //patch event object with standard props
					+ (elt.getAttribute("preventdefault")=="true" ? "event.returnValue=false;" : "") //preventdefault attr
					+ evtFilters + hdlrAct
				);
				var thisRef = this; //XXX - when does this ref get released?
				var hdlrFunc = function() {
					var hdlrs = thisRef._xblHandlers[window.event.type];
					for(var i=0; i<hdlrs.length; i++) {
						thisRef._xblTmp = hdlrs[i];
						thisRef._xblTmp();
					}
				};
				if(eltHdlrs[hdlrEvt].length==1) //only set one listener
					this.attachEvent("on"+hdlrEvt, hdlrFunc);
			}
		}

		// <constructor>
		if(i = binding.constructor) {
			this._xblTmp = new Function(i); //get the correct context
			this._xblTmp();
		}

		// Fire bindingattached event:
		// Not yet implemented. Need to use HTC for custom events?

		this._xblTmp = null; //cleanup
	},

	removeBinding : function(bindingURL) {
		//Fire bindingdetached event:
		// Not yet implemented.
	}
};
}
	
// DocumentXBL interface:
if(!window.DocumentXBL) {
DocumentXBL = {};
DocumentXBL.prototype = {
	bindingDocuments : {}, //hash: URL => Document Object

	loadBindingDocument : function(documentURL) {
		var XBL_NS = "http://www.mozilla.org/xbl";
		var docs = document.bindingDocuments;
		if(docs[documentURL]) return docs[documentURL]; //return cached if already loaded

		//Fetch XBL Document:
		var progIDs = ["Msxml2.DOMDocument.4.0","Msxml2.DOMDocument.3.0","MSXML2.DOMDocument","MSXML.DOMDocument","Microsoft.XmlDom"];
		var getProgID = function() {
			for(var i=0; i<progIDs.length; i++) { try {new ActiveXObject(progIDs[i]); return progIDs[i];} catch(e) {} }
			throw "No MSXML found on system; cannot retrieve XBL document.";
		};
		var doc = new ActiveXObject(getProgID());

		// load the XBL doc:
		doc.async = false; //synchronous retrieval per spec
		doc.load(documentURL);

		// parse the XBL doc and cache all bindings in a data structure:
		// we do this once to avoid re-parsing the DOM tree every time the
		// same binding is attached to an element.
		function isXBLElt(element, tagName) {
			return (element.namespaceURI == XBL_NS && element.nodeName.replace(/^[^:]:/, "") == tagName);
		};
		for(i=0; (elt=doc.documentElement.childNodes[i]); i++) {
			if(isXBLElt(elt, "binding")) {
				var b = document._xblBindingsData[documentURL + "#" + elt.getAttribute("id")] = {
					extend:null, images:[], scripts:[], stylesheets:[],
					content:null, methods:[], fields:[], properties:[],
					handlers:[], constructor:null, destructor:null
				};
				
				b.extend = elt.getAttribute("extends");
				for(j=0; (elt2=elt.childNodes[j]); j++) {
					if(isXBLElt(elt2, "resources")) {
						for(k=0; (elt3=elt2.childNodes[k]); k++) {
							if(isXBLElt(elt3, "image")) b.images[b.images.length] = elt3.getAttribute("src");
							else if(isXBLElt(elt3, "script")) {}
							else if(isXBLElt(elt3, "stylesheet")) {}
						}
					}
					else if(isXBLElt(elt2, "content")) b.content = elt2;
					else if(isXBLElt(elt2, "implementation")) {
						for(k=0; (elt3=elt2.childNodes[k]); k++) {
							if(isXBLElt(elt3, "method")) b.methods[b.methods.length] = elt3;
							else if(isXBLElt(elt3, "field")) b.fields[b.fields.length] = elt3;
							else if(isXBLElt(elt3, "property")) b.properties[b.properties.length] = elt3;
							else if(isXBLElt(elt3, "constructor") && elt3.firstChild) b.constructor = elt3.firstChild.nodeValue;
							else if(isXBLElt(elt3, "destructor") && elt3.firstChild) b.destructor = elt3.firstChild.nodeValue;
						}
					}
					else if(isXBLElt(elt2, "handlers")) {
						for(k=0; (elt3=elt2.childNodes[k]); k++) {
							if(isXBLElt(elt3, "handler")) b.handlers[b.handlers.length] = elt3;
						}
					}
				}
			}
		}
		
		// return the document object:
		return docs[documentURL] = doc;
	},

	// XXX - are these methods part of the spec or not?
	addBinding : function(elt, bindingURL) {
		return elt.addBinding(bindingURL);
	},
	removeBinding : function(elt, bindingURL) {
		return elt.removeBinding(bindingURL);
	},
	getAnonymousNodes : function(elt) {
		return elt.childNodes;
	},
	getBindingParent : function(elt) {
		return elt.bindingOwner;
	},
	getAnonymousElementByAttribute : function(element, attr, value) {
		// Not implemented
	}
};
}

// Add DocumentXBL interface's properties and methods to document:
for(var x in DocumentXBL.prototype) {
	if(!document[x]) document[x] = DocumentXBL.prototype[x];
}

if(window.attachEvent) { //Limited to IE/Win
	window.attachEvent("onload", function() {
		var i, elt;
		
		// create a hash object to store data structures of all loaded bindings for fast traversal (populated in DocumentXBL.loadBindingDocument):
		document._xblBindingsData = {};
		
		var all = document.all;
		for(i=0; (elt = all[i]); i++) {
			// Add ElementXBL methods:
			for(var x in ElementXBL.prototype) {
				//if(elt[x]) elt["_xblReal"+x.charAt(0).toUpperCase()+x.substring(1)] = elt[x]; //make backup if already exists, such as for overridden DOM methods.
				elt[x] = ElementXBL.prototype[x];
			}
		}
		
		// NOTE: have to do this in 2 passes otherwise properties on anon. content nodes will be overwritten by ElementXBL properties
		for(i=0; (elt = all[i]); i++) {
			// See if there's a binding set in the CSS, and if so attach it:
			if(!elt.currentStyle) continue;
			var binding = elt.currentStyle.getAttribute("moz-binding"); //IE strangely drops the "-" prefix on -moz-binding
			if(!binding) continue;
			var m = binding.match(/\s*url\s*\(\s*([^\)]+)\)\s*/); //extract the binding URL
			if(!m || !m[1]) continue; //illegal binding value; exit.

			elt.addBinding(m[1]);
		}
	});
	
	// HTC is useful for custom events and property getters/setters, but is inefficient when attaching to all elements.  Need to investigate ways to use HTC efficiently.
	//document.write('<style type="text/css">body * {behavior:url(XBL.htc)}</style>');
}
