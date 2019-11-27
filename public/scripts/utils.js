/**
 * Tests if given address is available with 2xx HTTP code.
 * 
 * @param url URL address to test.
 * @return  True if address is available with 2xx HTTP code.
 */
function checkIfLinkAccessible(url)
{
    // Try sending HTTP request to thi URL
    var http = new XMLHttpRequest();
    http.open('HEAD', url, false);
    http.send();

    // Test if HTTP status is 2xx
    return (http.status / 100) % 2 == 0;
}