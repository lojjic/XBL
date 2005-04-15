ElementXBL = {
	// Override standard DOM methods to be aware of anonymous content:
	getElementsByTagName : function(name) {
		return this._xblRealGetElementsByTagName(name);
	},
	appendChild : function(newChild) {
		var p = this; //XXX - need way to get to the insertion point
		XBL.insertBeforeHelper(p, newChild, null);
		return p._xblRealAppendChild(newChild);
	},
	insertBefore : function(newChild, refChild) {
		XBL.insertBeforeHelper(this, newChild, refChild);
		return this._xblRealInsertBefore(newChild, refChild);
	},
	replaceChild : function(newChild, oldChild) {
		return this._xblRealReplaceChild(newChild, oldChild);
	},
	removeChild : function(oldChild) {
		XBL.removeChildHelper(oldChild);
		return this._xblRealRemoveChild(oldChild);
	},
	hasChildNodes : function() {
		return this._xblRealHasChildNodes();
	},
	cloneNode : function(deep) {
		return this._xblRealCloneNode(deep);
	},

	_xblGetExplicitChildren : function() {
		if(!this._xblExplicitChildren) {
			this._xblExplicitChildren = [];
			var i, kid, kids=this.childNodes;
			for(i=0; (kid=kids[i]); i++) {
				element._xblExplicitChildren[i] = kid;
				// Handle any child text nodes:
				if(kid.nodeType==3) {
					kid._xblRealParentNode = element;
					kid._xblRealPrevSibling = kids[i-1];
					kid._xblRealNextSibling = kids[i+1];
				}
			}
		}
		return this._xblExplicitChildren;
	}
};



// Common routines used in override DOM methods:
removeChildHelper : function(child) { //updates DOM properties when child removed
	var i, x, y, p;
	if(!(p=child._xblRealParentNode)) return; //exit if parentless
	for(i=0; (x=p._xblRealChildNodes[i]); i++) {
		if(x==child) {
			var prev = p._xblRealChildNodes[i-1] || null;
			var next = p._xblRealChildNodes[i+1] || null;
			prev._xblRealNextSibling = next;
			next._xblRealPrevSibling = prev;
			for(i=i; i<p._xblRealChildNodes.length; i++) p._xblRealChildNodes[i] = p._xblRealChildNodes[i+1];
			p._xblRealChildNodes.length--;
			break;
		}
	}
	child._xblRealPrevSibling = child._xblRealNextSibling = child._xblRealParentNode = null;
},
insertBeforeHelper : function(parent, newChild, refChild) {
	var i, j, x, y, prev, next, kids=parent._xblRealChildNodes, refPos=null;
	XBL.removeChildHelper(newChild);

	if(refChild) for(i=0; (x=kids[i]); i++) if(x==refChild) {refPos = i; break;} //find index of refChild
	var len = kids.length; //keep orig length
	if(refPos) { // refChild is actual child; insert before.
		prev = kids[refPos-1];
		next = refChild;
		for(i=refPos; i<len; i++) kids[i+1] = kids[i]; //shift all up one slot
		kids[refPos] = newChild; //insert new child
	} else { // refChild is not actual child; insert at end.
		prev = kids[len-1] || null;
		next = null;
		kids[len] = newChild;
	}
	if(prev) prev._xblRealNextSibling = newChild;
	if(next) next._xblRealPrevSibling = newChild;
	newChild._xblRealPrevSibling = prev;
	newChild._xblRealNextSibling = next;
	newChild._xblRealParentNode = parent;
},

