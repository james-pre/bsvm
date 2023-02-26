import * as fs from 'fs';
import path from 'path';
import { parseArgs } from 'util';
import { install, update, installVersions, uninstallVersions, updateCache, resolveVersions, getVersions, config, setConfig, getConfig, getConfigPath } from './index.js';
import { updateLastLine } from './util.js';
const bsvm = { version: '0.0.1' }; //import bsvm from '../package.json' assert { type: 'json' };

//parse CLI arguements
const _args = parseArgs({
	options: {
		//BVM management
		help: { short: 'h', type: 'boolean' },
		version: { type: 'boolean' },
		update: { type: 'boolean' },
		install: { type: 'boolean' },

		//Command options
		verbose: { short: 'v', type: 'boolean' },
		force: { short: 'f', type: 'boolean' },
		'dry-run': { short: 'd', type: 'boolean' },
		'no-copy': { type: 'boolean' },
		'cache-no-update': { type: 'boolean' },
		'reload-cache': { type: 'boolean' },
		mode: { short: 'm', type: 'string' },
		global: { short: 'g', type: 'boolean' },
		all: { short: 'a', type: 'boolean' },
	},
	allowPositionals: true,
});

const args = _args.positionals;
const options = {
	//BVM management
	help: false,
	version: false,
	update: false,
	install: false,

	//Command options
	verbose: false,
	force: false,
	'dry-run': false,
	'no-copy': false,
	'cache-no-update': false,
	'reload-cache': false,
	mode: 'deploy',
	global: false,
	all: false,
	..._args.values,
};

if (options.version) {
	console.log(`BSVM v${bsvm.version}`);
	process.exit();
}

if (options.help || args[0] == 'help') {
	console.log(`BSVM usage:
	bsvm (--help | -h): Print this help message
	bsvm --version: Print the current version of BSVM
	bsvm --install: Install BSVM
	bsvm --update: Update BSVM (Not implemented yet)

	bsvm list: List installed versions of Blankstorm
		--all | -a: List all Blankstorm versions and whether they are downloaded or installed

	bsvm install [<version> ...]: Installs the specified version[s]
		--mode <value>: Command to use for installing (defaults to "deploy")
		--no-copy: Will not copy files if a <mode> command does not exist

	bsvm uninstall [<version> ...]: Uninstalls the specified version[s]
	bsvm update: Updates the local repository (downloads all Blankstorm versions)
	bsvm config <key> <value>: Sets the config <key> to <value>
		--global | -g: Applys the config change globally (not supported yet)


	bsvm <any command or flag command>:
		--verbose | -v: Output verbose/debug info
		--dry-run | -d: Run the command without changing files (not supported on most commands)
		--force | -f: Force command actions
		--cache-no-update: Do not update the cache
		--reload-cache: Foribly reload the cache
	`);
	process.exit();
}

if (options.install) {
	await install();
	process.exit();
}

if (options.update) {
	await update();
	process.exit();
}

if (!options['cache-no-update']) {
	try {
		const configPath = getConfigPath(options);
		if (!fs.existsSync(configPath) || (Date.now() - fs.statSync(configPath).ctime.getTime() < 1000 * 3600) || options['reload-cache']) {
			await updateCache(options, msg => {
				if (options.verbose) {
					updateLastLine(msg);
				}
			});
		}
		
	} catch (err) {
		console.log(`Failed to update cache ${options.verbose ? `: ${err}` : '.'}`);
	}
}

const versions = await getVersions(options);

switch (args[0]) {
	case 'install':
		const versionsToInstall = options.all ? versions : resolveVersions(args.slice(1), versions);
		await installVersions(versionsToInstall, options);
		break;
	case 'uninstall':
		const versionsToUninstall = options.all ? versions : resolveVersions(args.slice(1), versions);
		await uninstallVersions(versionsToUninstall, options);
		break;
	case 'update':
		await update();
		break;
	case 'list':
		//fetch releases from GitHub
		for (let version of versions) {
			const isInstalled = fs.existsSync(path.join(config.install_dir, version.tag));

			if (options.all) {
				console.log(`${version.name.replaceAll('\n','\x00')} <${version.tag}> ${isInstalled ? '(installed)' : version.isLocal ? '(downloaded)' : ''}`);
			} else if (isInstalled) {
				console.log(`${version.name.replaceAll('\n','\x00')} <${version.tag}>`);
			}
		}
		break;
	case 'config':
		if (args.length > 3) {
			setConfig(args[2], args[3], options);
		} else {
			getConfig(args[2], args[3], options);
		}
		break;
	default:
		if(!options['reload-cache']){
			console.log(`Unsupported command: "${args[0]}"`);
		}
}
