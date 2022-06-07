const util = require('util')
const url = require('url')
const command = {
    name: 'build',
    alias:[],
    scope : "in",
    needs : ["frontend","backend"],
    description : "Build project for production",
    run: async toolbox => {
      const {
        project_def,
        prints : {error,info,log},
        filesystem:{writeAsync,copyAsync,exists,removeAsync, dirAsync, findAsync},
        system : {run},
        prompts,
        patching : {patch},
        template : {generate},
        path,
        filesystem : {read}
      } = toolbox
      
      const def_content = read(project_def,"json")
      const root_dir = path.dirname(project_def)
      const frontend_path = path.join(root_dir,def_content.projects.frontend_path)
      const backend_path = path.join(root_dir,def_content.projects.backend_path)
      const back_cors_path = path.join(backend_path,'src/configs/cors/config.js').replace(/\\/g,"/")
      const front_cors_path = path.join(frontend_path,'src/environments/environment.prod.ts').replace(/\\/g,"/")

      let back_cors = await import(url.pathToFileURL(back_cors_path))
      
      let cors_conf = await prompts.confirm("Do you want to modify the cors config ?")

      if(cors_conf){
        function validateAddress(address){
          let pattern = /(\b(?:(?:2(?:[0-4][0-9]|5[0-5])|[0-1]?[0-9]?[0-9])\.){3}(?:(?:2([0-4][0-9]|5[0-5])|[0-1]?[0-9]?[0-9]))\b)|localhost|(^((?:([a-z0-9]\.|[a-z0-9][a-z0-9\-]{0,61}[a-z0-9])\.)+)([a-z0-9]{2,63}|(?:[a-z0-9][a-z0-9\-]{0,61}[a-z0-9]))\.?$)/gi
          let test = pattern.test(address)
          if(!test || address.length<=0){
            return "Enter valid address - ex : 192.168.0.1, localhost or example.com"
          }
          return true
        }
      
        let url = await prompts.ask("Enter domain name or IP ",validateAddress);
        url = `https://${url}`

        let is_present = back_cors.default.whitelist.some(address => url == address)

        if(!is_present){
          back_cors.default.whitelist = back_cors.default.whitelist.concat([url])
        }
      
        await writeAsync(`${back_cors_path}`,`export default ${util.inspect(back_cors.default)}`,{jsonIndent:4})
        await patch(
          front_cors_path, 
          { insert: `API_URL: '${url}/api/'`, replace: new RegExp(/API_URL.*'.*'/g) },
          { insert: `ORIGIN_URL: '${url}'`, replace: new RegExp(/ORIGIN_URL.*'.*'/g) }
        )
      }
      let build_dir = path.join(root_dir,"dist");

      let key_certificate = await findAsync(path.join(root_dir,"sslcert"),{
        matching : '*.key'
      })
      if(key_certificate.length!=1){
        error("Found zero or multiple .key files, did you put it in the sslcert folder ?")
        process.exit(0)
      }
      let crt_certificate = await findAsync(path.join(root_dir,"sslcert"),{
        matching : '*.crt'
      })
      if(crt_certificate.length!=1){
        error("Found zero or multiple .crt files, did you put it in the sslcert folder ?")
        process.exit(0)
      }

      if(exists(build_dir)){
        toolbox.loader = info("Deleting previous build directory ",true);
        await removeAsync(build_dir)
        toolbox.loader.succeed();
      }
      toolbox.loader = info('Copying backend to dist',true)
      await copyAsync(backend_path, build_dir, {
        overwrite: true,
        matching: [
          './!(node_modules)',
          './!(node_modules)/**/!(server.js)'
        ]
      })
      toolbox.loader.succeed()
      toolbox.loader = info('Installing backend dependencies ',true)
      await run(`npm install --silent`,{ 
        cwd: build_dir
      }).catch(err=>{
        toolbox.loader.fail()
        error(err.stdout)
        error(err.stderr)
        process.exit(0);
      })
      toolbox.loader.succeed()

      toolbox.loader = info('Update app.js for production ',true)
      let dirnameString = "import * as url from 'url';\nimport path from 'path';\nconst __dirname = path.dirname(url.fileURLToPath(import.meta.url))\n"
      let angularStr = "// Angular \napp.use(express.static(path.join(__dirname, \"public\")));\napp.get('**', function (req, res) {\n\tres.sendFile(__dirname + '/public/index.html');\n});\n\n"
      await patch(path.join(build_dir,"src/app.js"), { insert: angularStr, before: "// catch 404" })
      await patch(path.join(build_dir,"src/app.js"), { insert: dirnameString, before: "const app = express();"})
      await dirAsync(path.join(build_dir,"src/public"))
      toolbox.loader.succeed()

      if(!exists(path.join(frontend_path,"node_modules"))){
        toolbox.loader = info('Installing frontend dependencies ',true)
        await run(`npm install --silent`,{ 
          cwd: frontend_path
        }).catch(err=>{
          toolbox.loader.fail()
          error(err.stdout)
          error(err.stderr)
          process.exit(0);
        })
        toolbox.loader.succeed()
      }
      toolbox.loader = info('Building frontend to dist/src/public ',true)
      await run(`ng build --configuration=production --output-path=${path.relative(frontend_path,path.join(build_dir,"src/public"))}`,{ 
        cwd: frontend_path
      }).catch(err=>{
        toolbox.loader.fail()
        error(err.stdout)
        error(err.stderr)
        process.exit(0);
      })
      toolbox.loader.succeed()

      toolbox.loader = info('Generating new server file ',true)
      await generate({
        template: 'buildForProd/server.js.ejs',
        target: `${path.join(build_dir,"src/server.js")}`,
        props: { 
          sslkey : path.basename(key_certificate[0]),
          sslcrt : path.basename(crt_certificate[0])
        },
      })
      await patch(path.join(build_dir,"src/server.js"), { insert: dirnameString, after: "import fs from 'fs';"})
      toolbox.loader.succeed()

      info('Build finished !')
    }
  }
  
  module.exports = command
  