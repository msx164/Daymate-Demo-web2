using System;
using System.ComponentModel;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Text;
using System.Windows.Forms;

internal static class DaymateLauncher
{
    private static readonly string Root = AppDomain.CurrentDomain.BaseDirectory;
    [STAThread]
    private static int Main(string[] args)
    {
        bool check = Array.IndexOf(args, "--check") >= 0;
        if (check) return Run(true);
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);
        using (Form splash = new Form())
        {
            splash.Text = "Daymate";
            splash.ClientSize = new Size(390, 155);
            splash.FormBorderStyle = FormBorderStyle.FixedDialog;
            splash.MaximizeBox = false;
            splash.MinimizeBox = false;
            splash.StartPosition = FormStartPosition.CenterScreen;
            splash.BackColor = Color.FromArgb(250,246,239);
            string iconPath = Path.Combine(Root,"Daymate.ico");
            if (File.Exists(iconPath)) splash.Icon = new Icon(iconPath);
            Label title = new Label { Text = "Daymate", Font = new Font("Microsoft YaHei",22,FontStyle.Bold), ForeColor = Color.FromArgb(23,93,102), AutoSize = true, Location = new Point(24,20) };
            Label detail = new Label { Text = "正在准备你的行动空间…", Font = new Font("Microsoft YaHei",11), AutoSize = true, Location = new Point(27,76) };
            ProgressBar progress = new ProgressBar { Style = ProgressBarStyle.Marquee, Location = new Point(28,116), Size = new Size(334,8) };
            splash.Controls.Add(title); splash.Controls.Add(detail); splash.Controls.Add(progress);
            BackgroundWorker worker = new BackgroundWorker();
            int code = 0;
            worker.DoWork += delegate { code = Run(false); };
            worker.RunWorkerCompleted += delegate(object sender, RunWorkerCompletedEventArgs e) {
                if (e.Error != null) { code=1; MessageBox.Show("启动失败："+e.Error.Message,"Daymate",MessageBoxButtons.OK,MessageBoxIcon.Error); }
                splash.Close();
            };
            splash.Shown += delegate { worker.RunWorkerAsync(); };
            Application.Run(splash);
            return code;
        }
    }
    private static int Run(bool check)
    {
        string log = Path.Combine(Root,".sandbox","desktop-launch.log");
        try
        {
            string script = Path.Combine(Root,"Open-Daymate.ps1");
            if (!File.Exists(script)) throw new FileNotFoundException("缺少启动组件，请把 Daymate.exe 保留在应用目录中。",script);
            Directory.CreateDirectory(Path.GetDirectoryName(log));
            ProcessStartInfo info = new ProcessStartInfo();
            info.FileName = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.System),"WindowsPowerShell","v1.0","powershell.exe");
            info.Arguments = "-NoProfile -NonInteractive -ExecutionPolicy Bypass -File \"" + script + "\"" + (check ? " -NoOpen" : "");
            info.WorkingDirectory = Root;
            info.UseShellExecute = false; info.CreateNoWindow = true;
            info.WindowStyle = ProcessWindowStyle.Hidden;
            info.RedirectStandardOutput = true; info.RedirectStandardError = true;
            StringBuilder output = new StringBuilder();
            using (Process child = new Process())
            {
                child.StartInfo=info;
                child.OutputDataReceived += delegate(object s, DataReceivedEventArgs e) { if(e.Data!=null)lock(output)output.AppendLine(e.Data); };
                child.ErrorDataReceived += delegate(object s, DataReceivedEventArgs e) { if(e.Data!=null)lock(output)output.AppendLine(e.Data); };
                child.Start();child.BeginOutputReadLine();child.BeginErrorReadLine();child.WaitForExit();
                File.WriteAllText(log, DateTime.Now.ToString("s") + Environment.NewLine + output.ToString(),Encoding.UTF8);
                if(child.ExitCode!=0 && !check) MessageBox.Show("Daymate 暂时未能启动。\n\n详细信息已保存到：\n"+log,"Daymate",MessageBoxButtons.OK,MessageBoxIcon.Error);
                return child.ExitCode;
            }
        }
        catch(Exception e)
        {
            try { Directory.CreateDirectory(Path.GetDirectoryName(log));File.WriteAllText(log,e.ToString(),Encoding.UTF8); } catch { }
            if(!check)MessageBox.Show(e.Message,"Daymate",MessageBoxButtons.OK,MessageBoxIcon.Error);
            return 1;
        }
    }
}
