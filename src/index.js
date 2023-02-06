
import * as fs from 'fs';
import { homedir } from 'os';
import path from 'path';
import { parseArgs } from 'util';
import bvm from '../package.json' assert { type: 'json' };

const local_config_path = path.join(homedir(), '/.bsdk.config'),
	global_config_path = local_config_path;

let config = {};
if(fs.existsSync(local_config_path)){
	const content = fs.readFileSync(local_config_path, { encoding: 'utf-8' });
	Object.assign(config, JSON.parse(content));
}
if(fs.existsSync(global_config_path)){
	const content = fs.readFileSync(global_config_path, { encoding: 'utf-8' });
	Object.assign(config, JSON.parse(content));
}

const _args = parseArgs({
	options: {
		version: { type: 'boolean' },
		verbose: { short: 'v', type: 'boolean' },
		'dry-run': { short: 'd', type: 'boolean' },
		installDir: { short: 'i', type: 'string' },
		gitDir: { type: 'string' },
		global: { short: 'g', type: 'boolean' },
		all: { short: 'a', type: 'boolean' },
	},
	allowPositionals: true
});

const args = _args.positionals, options = {
	version: false,
	verbose: false,
	'dry-run': false,
	installDir: config.install_dir,
	gitDir: config.git_dir,
	global: false,
	all: false,
	..._args.values
};

if(options.version){
	console.log(`BVM v${bvm.version}`);
	process.exit();
}

switch(args[0]){
	case 'install':
		args.shift();
		break;
	case 'uninstall':
		args.shift();
		break;
	case 'list':
		break;
	case 'config':
		const configPath = options.global ? global_config_path : local_config_path;
		if(options.global){
			console.log('Warning: global config is not supported yet.');
		}
		let _config = {};
		if(!fs.existsSync(configPath) && options.verbose){
			console.log(`No config file found at ${configPath}, creating.`);
		}else{
			const content = fs.readFileSync(configPath, { encoding: 'utf-8' });
			Object.assign(_config, JSON.parse(content));
		}
		_config[args[1]] = args[2];
		fs.writeFileSync(configPath, JSON.stringify(_config));
		break;
	default:
		console.log(`Unsupported command: "${args[0]}"`)
}