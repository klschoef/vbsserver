<?php

$dir = new DirectoryIterator("msb/");

$msb = [];

foreach ($dir as $fileinfo) {
    if (!$fileinfo->isDot()) {
        
        $list = [];        
        
        $str = file_get_contents("msb/" . $fileinfo);
        
        $lines = split("\n", $str);
        for ($i=2; $i<count($lines); $i++) {
            $line = trim($lines[$i]);
            if (strlen($line) > 0) {
                $tmp = split(" ", $line);
                array_push($list, $tmp[1]);
            }
        }
        
        $msb['' . basename($fileinfo, ".msb")] = $list;
                
    }
}

file_put_contents("msb.json", json_encode($msb));
echo "OK";

?>
