@echo off
REM HY-AQMS NestJS Setup (Windows)
REM Creates recommended NestJS project directories

SET BASE=%~dp0\..
cd /d %BASE%

mkdir backend\src 2>nul
mkdir backend\src\modules 2>nul
mkdir backend\src\modules\auth 2>nul
mkdir backend\src\modules\auth\entities 2>nul
mkdir backend\src\modules\devices 2>nul
mkdir backend\src\modules\readings 2>nul
mkdir backend\src\modules\analytics 2>nul
mkdir backend\src\modules\mqtt 2>nul
mkdir backend\src\modules\export 2>nul
mkdir backend\src\modules\health 2>nul
mkdir backend\src\config 2>nul
mkdir backend\src\common\decorators 2>nul
mkdir backend\src\common\filters 2>nul
mkdir backend\src\common\guards 2>nul
mkdir backend\src\common\interceptors 2>nul
mkdir backend\src\common\middleware 2>nul
mkdir backend\src\common\pipes 2>nul
mkdir backend\src\shared\services 2>nul
mkdir backend\migrations 2>nul
mkdir backend\test\e2e 2>nul

echo Directories created under %BASE%backend\src\

echo Run "npm install" inside backend and then "npm run start:dev" after adding files.
pause
