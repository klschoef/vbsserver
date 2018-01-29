<?php

// this script converts a csv file containing groundtruth 
// in the format trecvidId;videoId;shotId;correct
// to a corresponding JSON object


$gt;

$handle = fopen("2018/trecvidGT17.csv", "r");
if ($handle) {
    while (($line = fgets($handle)) !== false) {
        // process the line read.
        $tmp = split(";", $line);
        
        $gt['' . trim($tmp[0])][''.trim($tmp[1])][''.trim($tmp[2])] = trim($tmp[3]) == 1;
        
        
    }

    fclose($handle);
} else {
    // error opening the file.
} 


file_put_contents("2018/trecvidGroundTruth.json", json_encode($gt));
echo "OK";

?>
