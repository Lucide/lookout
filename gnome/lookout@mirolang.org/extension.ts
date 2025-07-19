import Gio from 'gi://Gio';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import Cloak from './cloak.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';

/**
 * Main extension class.
 */
export default class Lookout extends Extension {
    private gsettings?: Gio.Settings;
    private cloak?: Cloak;
    private windowManager = Main.wm;
    // private keyBindingAction = 0; // Not needed?

    /**
     * Helper method to add simple keybindings.
     * 
     * The keybindings must be removed using removeKeybinding.
     * 
     * @param name the key for binding the GSettings object
     * @param handler the callback function to invoke when the keys are pressed
     */
    private addKeybinding(name: string, handler: Meta.KeyHandlerFunc) {
        // If it didn't fail, set the keybinding
        if (this.gsettings != null) {
            console.debug(`Lookout [debug]: Fetch shortcut "${name}": "${this.gsettings.get_value(name)?.deepUnpack()}" (might change later)`);
            // AddKeybinding returns a number
            // for now we only need it to check for success
            let code = this.windowManager.addKeybinding(
                name,
                this.gsettings,
                Meta.KeyBindingFlags.NONE,  // No special requirements
                Shell.ActionMode.ALL,       // Always available
                handler);                   // Run handler when pressed
            if (code === Meta.KeyBindingAction.NONE) {
                console.debug(`Lookout [debug]: Shortcut registered "${name}" with ID ${code}`);
            } else {
                console.error(`Lookout [error]: Failed to register shortcut "${name}", returned "Meta.KeyBindingAction.NONE`);
            }
        } else {
            console.error(`Lookout [error]: Failed to register shortcut "${name}", prefs not set`);
        }
    }

    /**
     * Helper function to remove keybindings added with addKeybinding.
     * 
     * @param name the key for binding the GSettings object
     */
    private removeKeybinding(name: string) {
        this.windowManager.removeKeybinding(name);
    }

    /**
     * Invoked when the extension is enabled.
     * 
     * Creates the service object (exported on DBus)
     * and binds the keyboard shortcut to `service.Reveal()`.
     */
    enable() {
        console.debug('Lookout [debug]: Enabling');
        // Create the service object immediately,
        // so the DBus object is available as soon as possible 
        this.cloak = new Cloak(
            global.stage,
            global.compositor,
            global.backend.get_cursor_tracker());
        console.debug('Lookout [debug]: Service creates, DBus might not be acquired yet');

        // Get settings
        this.gsettings = this.getSettings();
        console.debug('Lookout [debug]: Fetched prefs GSettings object');

        // Add keybindings
        this.addKeybinding('reveal-shortcut', this.cloak.Reveal.bind(this.cloak));
        this.addKeybinding('hide-shortcut', this.cloak.Hide.bind(this.cloak));
        this.addKeybinding('toggle-shortcut', this.cloak.Toggle.bind(this.cloak));
    }

    /**
     * Invoked when the extension is disabled.
     * 
     * Close the service object (unexporting it on DBus)
     * and unbinds the keyboard shortcut to `service.Reveal()`.
     */
    disable() {
        console.debug('Lookout [debug]: Disabling');
        // Remove keybindings
        this.removeKeybinding('reveal-shortcut');
        this.removeKeybinding('hide-shortcut');
        this.removeKeybinding('toggle-shortcut');
        // Destroy settings
        this.gsettings = undefined;
        // Close and destroy service
        this.cloak?.close();
        this.cloak = undefined;
    }
}