import {
    Rule, SchematicContext,
    Tree, SchematicsException
} from '@angular-devkit/schematics';
import { NodePackageInstallTask } from '@angular-devkit/schematics/tasks';
import { NgAddSchema } from './schema';
import { addImportToModule } from '@schematics/angular/utility/ast-utils';
import { InsertChange } from '@schematics/angular/utility/change';
import * as ts from '@schematics/angular/third_party/github.com/Microsoft/TypeScript/lib/typescript';

export default function (_options: NgAddSchema): Rule {
    return (_tree: Tree, _context: SchematicContext) => {
        // 如果不是Angular项目则抛出错误
        const workspaceConfigBuffer = _tree.read('angular.json');
        if (!workspaceConfigBuffer) {
            throw new SchematicsException('Not an Angular CLI workspace');
        }
        const packageData =JSON.parse(_tree.read('package.json')!.toString('utf-8'));

        // 取得project的根目录
        const workspaceConfig = JSON.parse(workspaceConfigBuffer.toString());
        const projectName = _options.project || workspaceConfig.defaultProject || packageData.name;
        const project = workspaceConfig.projects[projectName];
        const defaultProjectPath = buildDefaultPath(project);

        // 将FontAwesomeModule加入AppModule
        const modulePath = `${defaultProjectPath}/app.module.ts`;
        const sourceFile = readIntoSourceFile(_tree, modulePath);
        const importPath = '@fortawesome/angular-fontawesome';
        const moduleName = 'FontAwesomeModule';
        const declarationChanges = addImportToModule(sourceFile, modulePath, moduleName, importPath);

        const declarationRecorder = _tree.beginUpdate(modulePath);
        for (const change of declarationChanges) {
            if (change instanceof InsertChange) {
                declarationRecorder.insertLeft(change.pos, change.toAdd);
            }
        }
        _tree.commitUpdate(declarationRecorder);

        // 将某个 icon 引入到 app.component.ts，再到 app.component.html 中使用它（声明实例化）

        // 获取app.component.ts中的AST
        const componentPath = `${defaultProjectPath}/app.component.ts`;
        const componentSourceFile = readIntoSourceFile(_tree, componentPath);

        // 取得所有的 ImportDeclaration
        const allImports = componentSourceFile.statements.filter(node => ts.isImportDeclaration(node))! as ts.ImportDeclaration[];

        // 找到最后一个 ImportDeclaration
        let lastImport: ts.Node | undefined;
        for (const importNode of allImports) {
            if (!lastImport || importNode.getStart() > lastImport.getStart()) {
                lastImport = importNode;
            }
        }

        // 找到 ClassDeclaration
        const classDeclaration = componentSourceFile.statements.find(node => ts.isClassDeclaration(node))! as ts.ClassDeclaration;

        // 取得所有的property
        const allProperties = classDeclaration.members.filter(node => ts.isPropertyDeclaration(node))! as ts.PropertyDeclaration[];

        // 取得最后一个property
        let lastProperty: ts.Node | undefined;
        for (const propertyNode of allProperties) {
            if (!lastProperty || propertyNode.getStart() > lastProperty.getStart()) {
                lastProperty = propertyNode;
            }
        }

        const componentRecorder = _tree.beginUpdate(componentPath);
        const importFaCoffee = '\nimport { faCoffee } from \'@fortawesome/free-solid-svg-icons\';';
        componentRecorder.insertLeft(lastImport!.end, importFaCoffee);

        // 添加声明部分的代码
        const faCoffeeProperty = 'faCoffee = faCoffee';
        const changeText = lastProperty ? lastProperty.getFullText() : '';
        let toInsert = '';
        if (changeText.match(/^\r?\r?\n/)) {
            toInsert = `${changeText.match(/^\r?\n\s*/)![0]}${faCoffeeProperty}`;
        } else {
            toInsert = `\n ${faCoffeeProperty}\n`;
        }

        // 插入字符串
        if (lastProperty) {
            componentRecorder.insertLeft(lastProperty!.end, toInsert);
        } else {
            componentRecorder.insertLeft(classDeclaration.end - 1, toInsert);
        }

        _tree.commitUpdate(componentRecorder);

        // 在app.component.html中添加内容
        const htmlPath = `${defaultProjectPath}/app.component.html`;
        const htmlStr = `\n<fa-icon [icon]="faCoffee"></fa-icon>\n`;
        const htmlSourceFile = readIntoSourceFile(_tree, htmlPath);
        const htmlRecorder = _tree.beginUpdate(htmlPath);
        htmlRecorder.insertLeft(htmlSourceFile.end, htmlStr);
        _tree.commitUpdate(htmlRecorder);

        // 修改package.json
        const dependencies = [
            { name: '@fortawesome/fontawesome-svg-core', version: '~6.2.1' },
            { name: '@fortawesome/free-solid-svg-icons', version: '~6.2.1' },
            { name: '@fortawesome/angular-fontawesome', version: '~0.11.0' }
        ];
        dependencies.forEach(dependency => {
            addPackageToPackageJson(
                _tree,
                dependency.name,
                dependency.version
            );
        });

        // 使用 Schematics 安装3个依赖 Package
        // 使用 Angular Schematics 的 API - NodePackageInstallTask
        _context.addTask(
            new NodePackageInstallTask({
                packageName: dependencies.map(d => d.name).join(' ')
            })
        );

        return _tree;
    }
}

function buildDefaultPath(project: any): any {
    const root = project.sourceRoot ? `/${project.sourceRoot}/` : `/${project.root}/src/`;
    const projectDirName =
        project['projectType'] === 'application' ? 'app' : 'lib';

    return `${root}${projectDirName}`;
}

// 读取文件
function readIntoSourceFile(host: Tree, modulePath: string): ts.SourceFile {
    const text = host.read(modulePath);
    if (text === null) {
        throw new SchematicsException(`File ${modulePath} does not exist.`);
    }
    const sourceText = text.toString('utf-8');
    return ts.createSourceFile(modulePath, sourceText, ts.ScriptTarget.Latest, true);
}

// 给package.json添加依赖包
function addPackageToPackageJson(host: Tree, pkg: string, version: string): Tree {
    if (host.exists('package.json')) {
        const sourceText = host.read('package.json')!.toString('utf-8');
        const json = JSON.parse(sourceText);
        if (!json.dependencies) {
            json.dependencies = {};
        }
        if (!json.dependencies[pkg]) {
            json.dependencies[pkg] = version;
            json.dependencies = sortObjectByKeys(json.dependencies);
        }
        host.overwrite('package.json', JSON.stringify(json, null, 2));
    }
    return host;
}

// 对象key排序
function sortObjectByKeys(obj: any) {
    return Object.keys(obj).sort().reduce((result, key) => (result[key] = obj[key]) && result, {} as any);
}