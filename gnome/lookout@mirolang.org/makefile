NAME=lookout
DOMAIN=mirolang.org
REVERSE_DOMAIN=org.mirolang

.PHONY: all pack install clean

all: dist/extension.js

node_modules: package.json
	npm install

dist/extension.js dist/prefs.js: *.ts node_modules  tsconfig.json
	- npx tsc

schemas/gschemas.compiled: schemas/org.gnome.shell.extensions.$(NAME).gschema.xml
	glib-compile-schemas schemas

build/$(NAME).zip: dist/extension.js dist/prefs.js schemas/gschemas.compiled metadata.json
	@mkdir -p build
	@rm -f dist/schemas/*
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