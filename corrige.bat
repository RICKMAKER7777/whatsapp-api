@echo off
@echo off
echo ============================================
echo CORRIGINDO PROJETO GIT (SUBMODULO DATA)
echo ============================================

REM --- garantir que estamos no diretorio do script ---
cd /d "%~dp0"

echo.
echo Removendo .git interno da pasta data...
if exist "data\.git" (
    rmdir /s /q data\.git
    echo OK: .git interno removido.
) else (
    echo Nao existe .git interno em data/.
)

echo.
echo Limpando referencias antigas no Git...
git rm -rf --cached data 2>nul

echo.
echo Re-adicionando diretorios corretamente...
git add .

echo.
echo Criando commit...
git commit -m "Fix: removido .git interno da pasta data e corrigido submodulo" || echo Nenhuma alteracao para commit.

echo.
echo Enviando para o GitHub...
git push origin main

echo.
echo ============================================
echo PROCESSO FINALIZADO!
echo ============================================
pause
