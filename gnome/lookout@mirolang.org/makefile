NAME=lookout
DOMAIN=mirolang.org

.PHONY: all pack install clean

all: dist/extension.js

node_modules: package.json
	npm install

dist/extension.js dist/prefs.js: *.ts node_modules 
	- npx tsc

schemas/gschemas.compiled: schemas/org.gnome.shell.extensions.$(NAME).gschema.xml
	glib-compile-schemas schemas

build/$(NAME).zip: dist/extension.js dist/prefs.js schemas/gschemas.compiled
	@mkdir -p build
	@cp -r schemas dist/
	@cp metadata.json dist/
	@(cd dist && zip ../build/$(NAME).zip -9r .)

pack: build/$(NAME).zip

install: build/$(NAME).zip
	@touch ~/.local/share/gnome-shell/extensions/$(NAME)@$(DOMAIN)
	@rm -rf ~/.local/share/gnome-shell/extensions/$(NAME)@$(DOMAIN)
	@cp -r dist ~/.local/share/gnome-shell/extensions/$(NAME)@$(DOMAIN)

clean:
	@rm -rf dist node_modules build schemas/gschemas.compiled