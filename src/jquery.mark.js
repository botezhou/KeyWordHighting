
"use strict";
(factory => {
    if(typeof define === "function" && define.amd) {
        define(["jquery"], jQuery => {
            return factory(jQuery);
        });
    } else if(typeof exports === "object") {
        factory(require("jquery"));
    } else {
        factory(jQuery);
    }
})($ => {
    class Mark {
        constructor($ctx, opt, sv) {

            this.opt = Object.assign({}, {
                "element": "*",
                "className": "*",
                "filter": [],
                "separateWordSearch": false,
                "diacritics": true,
                "synonyms": {},
                "iframes": false,
                "wordBoundary": false,
                "complete": function () {},
                "each": function () {},
                "debug": false,
                "log": window.console
            }, opt);

            this.sv = typeof sv === "string" ? [sv] : sv;
            this.$ctx = $ctx;

            this.dct = [

            ];
        }
        log(msg, level = "debug") {
            if(!this.opt.debug) {
                return;
            }
            let log = this.opt.log;
            if(typeof log === "object" && typeof log[level] === "function") {
                log[level](`jquery.mark: ${msg}`);
            }
        }

        escapeStr(str) {
            return str.replace(/[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g, "\\$&");
        }

        createRegExp(str) {
            str = this.escapeStr(str);
            if(Object.keys(this.opt.synonyms).length > 0) {
                str = this.createSynonymsRegExp(str);
            }
            if(this.opt.diacritics) {
                str = this.createDiacriticsRegExp(str);
            }
            if(this.opt.wordBoundary) {
                str = this.createWordBoundaryRegExp(str);
            }
            return str;
        }
        createSynonymsRegExp(str) {
            let syn = this.opt.synonyms;
            for(let index in syn) {
                if(syn.hasOwnProperty(index)) {
                    let value = syn[index];
                    let k1 = this.escapeStr(index);
                    let k2 = this.escapeStr(value);
                    str = str.replace(
                        new RegExp(`(${k1}|${k2})`, "gmi"), `(${k1}|${k2})`
                    );
                }
            }
            return str;
        }
        createDiacriticsRegExp(str) {
            let charArr = str.split("");
            let handled = [];
            charArr.forEach(ch => {
                this.dct.every(dct => {
                    if(dct.indexOf(ch) !== -1) {
                        if(handled.indexOf(dct) > -1) {
                            return false;
                        }

                        str = str.replace(
                            new RegExp(`[${dct}]`, "gmi"), `[${dct}]`
                        );
                        handled.push(dct);
                    }
                    return true;
                });
            });
            return str;
        }
        createWordBoundaryRegExp(str) {
            return `\\b${str}\\b`;
        }
        getSeparatedKeywords() {
            let stack = [];
            this.sv.forEach(kw => {
                if(!this.opt.separateWordSearch) {
                    if(kw.trim() !== "") {
                        stack.push(kw);
                    }
                } else {
                    kw.split(" ").forEach(kwSplitted => {
                        if(kwSplitted.trim() !== "") {
                            stack.push(kwSplitted);
                        }
                    });
                }
            });
            return {
                "keywords": stack,
                "length": stack.length
            };
        }

        getElements() {
            if(this.$ctx.length < 1) {
                this.log("Empty context", "warn");
            }
            let $stack = this.$ctx.add(this.$ctx.find("*"));
            let length = $stack.length;
            return {
                "elements": $stack,
                "length": length
            };
        }

        matchesFilter($el, exclM) {
            let remain = true;
            let fltr = this.opt.filter.concat(["script", "style", "title"]);
            if(!this.opt.iframes) {
                fltr = fltr.concat(["iframe"]);
            }
            if(exclM) {
                fltr = fltr.concat(["*[data-jquery-mark='true']"]);
            }
            fltr.every(filter => {
                if($el.is(filter)) {
                    return remain = false;
                }
                return true;
            });
            return !remain;
        }
        onIframeReady($i, successFn, errorFn) {
            try {
                const iCon = $i.first()[0].contentWindow,
                    bl = "about:blank",
                    compl = "complete";
                const callCallback = () => {
                    try {
                        const $con = $i.contents();
                        if($con.length === 0) { 
                            throw new Error("iframe inaccessible");
                        }
                        successFn($con);
                    } catch(e) { 
                        errorFn();
                    }
                };
                const observeOnload = () => {
                    $i.on("load.jqueryMark", () => {
                        try {
                            const src = $i.attr("src").trim(),
                                href = iCon.location.href;
                            if(href !== bl || src === bl || src === "") {
                                $i.off("load.jqueryMark");
                                callCallback();
                            }
                        } catch(e) {
                            errorFn();
                        }
                    });
                };
                if(iCon.document.readyState === compl) {
                    const src = $i.attr("src").trim(),
                        href = iCon.location.href;
                    if(href === bl && src !== bl && src !== "") {
                        observeOnload();
                    } else {
                        callCallback();
                    }
                } else {
                    observeOnload();
                }
            } catch(e) { 
                errorFn();
            }
        }

        forEachElementInIframe($i, cb, end = function () {}) {
            let open = 0,
                checkEnd = () => {
                    if((--open) < 1) end();
                };
            this.onIframeReady($i, $con => {
                let $stack = $con.find("*");
                open = $stack.length;
                if(open === 0) checkEnd();
                $stack.each((i, el) => {
                    let $el = $(el);
                    if($el.is("iframe")) {
                        let j = 0;
                        this.forEachElementInIframe($el, ($iel, len) => {
                            cb($iel, len);
                            if((len - 1) === j) checkEnd();
                            j++;
                        }, checkEnd);
                    } else {
                        cb($el, $stack.length);
                        checkEnd();
                    }
                });
            }, () => {
                let src = $i.attr("src");
                this.log(`iframe '${src}' could not be accessed`, "warn");
                checkEnd();
            });
        }

        forEachElement(cb, end = function () {}, exclM = true) {
            let {
                elements: $stack,
                length: open
            } = this.getElements(),
                checkEnd = () => {
                    if((--open) === 0) end();
                };
            if(open === 0) end(); 
            $stack.each((i, el) => {
                let $el = $(el);
                if(!this.matchesFilter($el, exclM)) {
                    if($el.is("iframe")) {
                        this.forEachElementInIframe($el, ($iel) => {
                            if(!this.matchesFilter($iel, exclM)) {
                                cb($iel);
                            }
                        }, checkEnd);
                        return; 
                    } else {
                        cb($el);
                    }
                }
                checkEnd();
            });
        }

        forEachNode(cb, end = function () {}) {
            this.forEachElement(($el) => {
                $el.contents().each((i, n) => {
                    if(n.nodeType === 3 && n.textContent.trim() !== "") {
                        cb(n);
                    }
                });
            }, end);
        }

        wrapMatches(node, regex) {
            let hEl = this.opt.element === "*" ? "span" : this.opt.element,
                hCl = this.opt.className === "*" ? "mark" : this.opt.className,
                match;
            while((match = regex.exec(node.textContent)) !== null) {
 
                let startNode = node.splitText(match.index);
                node = startNode.splitText(match[0].length);
                if(startNode.parentNode !== null) {
                    let $repl = $(`<${hEl} />`, {
                        "class": hCl,
                        "data-jquery-mark": true,
                        "text": match[0]
                    });
                    startNode.parentNode.replaceChild(
                        $repl[0],
                        startNode
                    );
                    this.opt.each($repl);
                }
                regex.lastIndex = 0; 
            }
        }
        perform() {
            if(this.sv instanceof RegExp) {
                this.log(`Searching with expression "${this.sv}"`);
                this.forEachNode(node => {
                    this.wrapMatches(node, this.sv);
                }, this.opt.complete);
            } else {
                let {
                    keywords: kwArr,
                    length: kwArrLen
                } = this.getSeparatedKeywords();
                if(kwArrLen === 0) this.opt.complete();
                kwArr.forEach(kw => {
                    let regex = new RegExp(this.createRegExp(kw), "gmi");
                    this.log(`Searching with expression "${regex}"`);
                    this.forEachNode(node => {
                        this.wrapMatches(node, regex);
                    }, () => {
                        if(kwArr[kwArrLen - 1] === kw) this.opt.complete();
                    });
                });
            }
        }

        remove() {
            let sel = `${this.opt.element}[data-jquery-mark="true"]`;
            let hCl = this.opt.className;
            if(hCl !== "*") {
                sel += `.${hCl}`;
            }
            this.log(`Removal selector "${sel}"`);
            this.forEachElement(el => {
                let $this = $(el);
                if($this.is(sel)) {
                    let $parent = $this.parent();
                    $this.replaceWith($this.html());
                 
                    $parent[0].normalize();
                }
            }, this.opt.complete, false);
        }
    }

    $.fn.mark = function (kw, opt) {
        let instance = new Mark($(this), opt, kw);
        return instance.perform();
    };

    $.fn.markRegExp = function (reg, opt) {
        let instance = new Mark($(this), opt, reg);
        return instance.perform();
    };

    $.fn.removeMark = function (opt) {
        let instance = new Mark($(this), opt);
        return instance.remove();
    };

});
