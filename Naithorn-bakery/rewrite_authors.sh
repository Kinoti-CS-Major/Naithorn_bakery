#!/bin/sh
git filter-repo --name-callback '
    return b"Kinoti-CS-Major"
' --email-callback '
    return b"bkinoti837@gmail.com"
'
