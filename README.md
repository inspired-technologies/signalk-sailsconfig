# Sails configuration and inventory
Signal K Node server plugin to configure and manage a vessel's sails inventory and current configuration.

## Deprecation Notice
This plugin has been re-baselined on the orginal SailConfiguration plugin but adds Sail Management functionality via REST APIs. This has been proposed as PR to the maintainers. Once the PR is accepted, this additional plugin may be obsolete and could be deprecated.  

## Plugin Config Update
Regardless if moving to @signalk-sailsconfiguration or upgrading from an earlier version of signalk-sailsconfig, the plugin configuration file needs to be upgraded to the latest structure. Instead of re-creating from scratch you can use your preferred AI chat solution (eg. Claude, ChatGPT, etc.) by leverarging the attached [prompt](./plogin-config.md#sail-configuration-transformation-instructions).


## Release History
- v0.2.1 Initial public release
- v0.4.0 REST API for App Integration
- v0.6.x Maintenance releases with package bumps
- v0.9.0 Re-baselined to v1.1.0 of @signalk/sailsconfiguration
- v0.9.5 SailManagement for @signalk/sailsconfiguration (PR to v1.2.0) 

