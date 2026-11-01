using System;
using System.IO;
using System.IO.Compression;
using System.Reflection;
using System.Diagnostics;
using System.Windows.Forms;
class Installer {
 [STAThread] static void Main() {
  Application.EnableVisualStyles();
  string dest=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"Programs","DaymateWeb2Public");
  if(MessageBox.Show("将安装不含API密钥的 Daymate Web2 公开版，并创建桌面快捷方式。\n\n安装位置："+dest+"\n\n独立端口8018/5188，原Daymate不受影响。继续安装？","Daymate 安装",MessageBoxButtons.YesNo,MessageBoxIcon.Question)!=DialogResult.Yes)return;
  try {
   Directory.CreateDirectory(dest);
   using(var stream=Assembly.GetExecutingAssembly().GetManifestResourceStream("payload"))
   using(var archive=new ZipArchive(stream,ZipArchiveMode.Read))
   foreach(var e in archive.Entries) {
    string full=Path.GetFullPath(Path.Combine(dest,e.FullName));
    if(!full.StartsWith(Path.GetFullPath(dest)+Path.DirectorySeparatorChar,StringComparison.OrdinalIgnoreCase))throw new Exception("安装路径无效");
    if(e.FullName.EndsWith("/")){Directory.CreateDirectory(full);continue;}
    Directory.CreateDirectory(Path.GetDirectoryName(full));
    using(var input=e.Open())using(var output=File.Create(full))input.CopyTo(output);
   }
   var shell=Activator.CreateInstance(Type.GetTypeFromProgID("WScript.Shell"));
   var link=shell.GetType().InvokeMember("CreateShortcut",BindingFlags.InvokeMethod,null,shell,new object[]{Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory),"Daymate Web2 公开版.lnk")});
   link.GetType().InvokeMember("TargetPath",BindingFlags.SetProperty,null,link,new object[]{Path.Combine(dest,"Daymate.exe")});
   link.GetType().InvokeMember("WorkingDirectory",BindingFlags.SetProperty,null,link,new object[]{dest});
   link.GetType().InvokeMember("IconLocation",BindingFlags.SetProperty,null,link,new object[]{Path.Combine(dest,"Daymate.ico")});
   link.GetType().InvokeMember("Save",BindingFlags.InvokeMethod,null,link,null);
   if(MessageBox.Show("安装完成。AI密钥需由使用者自行配置，说明已放入安装目录。\n\n现在打开应用？","Daymate",MessageBoxButtons.YesNo,MessageBoxIcon.Information)==DialogResult.Yes)Process.Start(Path.Combine(dest,"Daymate.exe"));
  } catch(Exception ex){MessageBox.Show("安装未完成："+ex.Message,"Daymate",MessageBoxButtons.OK,MessageBoxIcon.Error);}
 }
}
